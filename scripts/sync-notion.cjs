/**
 * Tech Price Guide - Notion → Markdown 자동 변환 스크립트
 * 노파싱 방식: notion-to-md로 자동 변환
 *
 * 환경변수:
 *   NOTION_API_KEY / NOTION_TOKEN  - Notion API 키
 *   NOTION_DATABASE_ID             - Notion 데이터베이스 ID
 *   SYNC_ACTION                    - 동작 (publish / delete / 미설정=전체동기화)
 *   SYNC_PAGE_ID                   - 특정 페이지 ID (웹훅 발행 시)
 *   TRIGGER_TYPE                   - 트리거 유형 (schedule / repository_dispatch / workflow_dispatch)
 *
 * 사용법:
 *   node scripts/sync-notion.cjs                    # DB 전체 동기화 (예약 발행)
 *   node scripts/sync-notion.cjs <PAGE_ID>          # 특정 페이지만 (웹훅 발행)
 */

const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');
const fs = require('fs');
const path = require('path');

// ── .env 파일 로드 ──
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

// ── 설정 ──
const NOTION_API_KEY = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const SYNC_ACTION = process.env.SYNC_ACTION || '';
const SYNC_PAGE_ID = process.env.SYNC_PAGE_ID || process.argv[2] || '';
const TRIGGER_TYPE = process.env.TRIGGER_TYPE || 'manual';
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'content', 'posts');

if (!NOTION_API_KEY || !DATABASE_ID) {
  console.error('NOTION_API_KEY/NOTION_TOKEN 또는 NOTION_DATABASE_ID 환경변수가 설정되지 않았습니다.');
  console.error('.env 파일 또는 GitHub Secrets를 확인하세요.');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

// ── 슬러그 정규화: URL-unsafe 문자 제거 ──
function sanitizeSlug(raw) {
  return raw
    .replace(/[?!@#$%^&*()+=\[\]{}<>|\\/"'`;:~]/g, '') // 특수문자 제거
    .replace(/,/g, '')           // 쉼표 제거
    .replace(/\s+/g, '-')        // 공백 → 하이픈
    .replace(/-{2,}/g, '-')      // 연속 하이픈 정리
    .replace(/^-|-$/g, '')       // 앞뒤 하이픈 제거
    .toLowerCase();
}

// ── 기존 .md 파일에서 notionPageId → 슬러그 매핑 ──
function getExistingPageMap() {
  const map = {}; // { notionPageId: { slug, filePath } }
  if (!fs.existsSync(OUTPUT_DIR)) return map;

  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/notionPageId:\s*"([^"]+)"/);
    if (match) {
      const slug = file.replace(/\.md$/, '');
      map[match[1]] = { slug, filePath };
    }
  }
  return map;
}

// ── 단일 페이지 변환 ──
async function syncPage(pageId, existingMap) {
  console.log(`\n--- 페이지 처리 중 (${pageId}) ---`);

  const page = await notion.pages.retrieve({ page_id: pageId });

  // Status 확인
  const status = page.properties.Status?.status?.name || '';
  console.log(`   Status: ${status}`);

  // ▶ Deleted → 파일 삭제
  if (status === 'Deleted' || status === 'deleted') {
    const existing = existingMap[pageId];
    if (existing && fs.existsSync(existing.filePath)) {
      fs.unlinkSync(existing.filePath);
      console.log(`   🗑️  삭제 완료: ${existing.filePath}`);
      return { action: 'deleted', slug: existing.slug };
    }
    console.log(`   삭제할 파일 없음 (이미 삭제됨)`);
    return { action: 'skipped' };
  }

  // ▶ Published가 아니면 스킵
  if (status !== 'Published') {
    console.log(`   ⏭️  스킵: Status="${status}" (Published만 처리)`);
    return { action: 'skipped' };
  }

  // ▶ 페이지 속성 추출
  const title = page.properties.Title?.title?.[0]?.plain_text || '제목 없음';
  const isWebhook = !!SYNC_PAGE_ID || TRIGGER_TYPE === 'repository_dispatch';
  const date = page.properties.Date?.date?.start || (isWebhook ? new Date().toISOString() : null);

  // ▶ 웹훅이 아닌 경우: 날짜 없으면 스킵, 미래 시간이면 스킵
  if (!isWebhook) {
    if (!date) {
      console.log(`   ⏭️  스킵: 날짜 미설정 (예약 발행 시 날짜 필수)`);
      return { action: 'skipped' };
    }
    const now = new Date();
    const publishDate = new Date(date);
    if (publishDate > now) {
      console.log(`   ⏭️  스킵: 예약 발행 (${date} > 현재 ${now.toISOString()})`);
      return { action: 'skipped' };
    }
  }

  const excerpt = page.properties.Excerpt?.rich_text?.[0]?.plain_text || '';
  const notionSlug = page.properties.Slug?.rich_text?.[0]?.plain_text || '';
  const tags = page.properties.Tags?.multi_select?.map(t => t.name) || [];

  console.log(`   제목: ${title}`);
  console.log(`   태그: ${tags.join(', ') || '(없음)'}`);

  // ▶ 슬러그 결정: 기존 파일이 있으면 유지 (단, 깨진 슬러그는 자동 수정)
  const existing = existingMap[pageId];
  let fileSlug;
  if (existing) {
    const cleanSlug = sanitizeSlug(existing.slug);
    if (cleanSlug !== existing.slug) {
      // 기존 슬러그에 특수문자가 있으면 리네임
      const newPath = path.join(OUTPUT_DIR, `${cleanSlug}.md`);
      if (fs.existsSync(existing.filePath)) {
        fs.unlinkSync(existing.filePath);
        console.log(`   🔧 깨진 슬러그 수정: ${existing.slug} → ${cleanSlug}`);
      }
      fileSlug = cleanSlug;
    } else {
      fileSlug = existing.slug;
      console.log(`   📌 기존 슬러그 유지: ${fileSlug}`);
    }
  } else {
    fileSlug = sanitizeSlug(notionSlug || title.replace(/\s+/g, '-').toLowerCase());
    console.log(`   🆕 신규 슬러그: ${fileSlug}`);
  }

  // ▶ notion-to-md로 마크다운 변환
  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdBlocks);
  const markdownContent = typeof mdString === 'string' ? mdString : mdString.parent;

  console.log(`   마크다운 길이: ${markdownContent.length}자`);

  // ▶ frontmatter 생성
  const dateFormatted = (date || new Date().toISOString()).split('T')[0];
  const autoExcerpt = excerpt || markdownContent.substring(0, 150).replace(/[#*\n]/g, '').trim() + '...';

  const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
description: "${autoExcerpt.replace(/"/g, '\\"')}"
publishedAt: "${dateFormatted}"
author: "Tech Price Guide"
tags: [${tags.map(t => `"${t}"`).join(', ')}]
notionPageId: "${pageId}"
---`;

  const fullContent = `${frontmatter}\n\n${markdownContent}`;

  // ▶ 저장
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, `${fileSlug}.md`);
  fs.writeFileSync(outputPath, fullContent, 'utf-8');
  console.log(`   💾 저장: ${outputPath}`);

  // ▶ 신규 발행이면 .published-slug 기록
  if (!existing) {
    const slugFile = path.join(__dirname, '..', '.published-slug');
    fs.writeFileSync(slugFile, fileSlug, 'utf-8');
    console.log(`   📢 신규 발행 → .published-slug: ${fileSlug}`);
  }

  return {
    action: existing ? 'updated' : 'created',
    title,
    slug: fileSlug,
    outputPath,
  };
}

// ── DB 전체 동기화 (예약 발행) ──
async function syncAll() {
  console.log('\n=== Notion DB 전체 동기화 시작 ===');
  console.log(`트리거: ${TRIGGER_TYPE}\n`);

  const existingMap = getExistingPageMap();
  console.log(`기존 포스트: ${Object.keys(existingMap).length}개`);

  // Published 글 가져오기 (페이지네이션으로 전체 조회)
  let publishedPages = [];
  let cursor = undefined;
  do {
    const res = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: { property: 'Status', status: { equals: 'Published' } },
      sorts: [{ property: 'Date', direction: 'descending' }],
      start_cursor: cursor,
    });
    publishedPages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  console.log(`Published 글: ${publishedPages.length}개 발견`);

  // Deleted 글 가져오기 (페이지네이션으로 전체 조회)
  let deletedPages = [];
  try {
    let delCursor = undefined;
    do {
      const res = await notion.databases.query({
        database_id: DATABASE_ID,
        filter: { property: 'Status', status: { equals: 'Deleted' } },
        start_cursor: delCursor,
      });
      deletedPages.push(...res.results);
      delCursor = res.has_more ? res.next_cursor : undefined;
    } while (delCursor);
    if (deletedPages.length > 0) {
      console.log(`Deleted 글: ${deletedPages.length}개 발견`);
    }
  } catch (err) {
    console.log('Deleted 상태 조회 스킵 (상태 없을 수 있음)');
  }

  const results = { created: 0, updated: 0, deleted: 0, skipped: 0 };

  // Published 동기화
  for (const page of publishedPages) {
    try {
      const r = await syncPage(page.id, existingMap);
      results[r.action] = (results[r.action] || 0) + 1;
    } catch (err) {
      console.error(`   ❌ 에러: ${err.message}`);
    }
  }

  // Deleted 처리
  for (const page of deletedPages) {
    try {
      const r = await syncPage(page.id, existingMap);
      results[r.action] = (results[r.action] || 0) + 1;
    } catch (err) {
      console.error(`   ❌ 에러: ${err.message}`);
    }
  }

  console.log(`\n=== 동기화 완료 ===`);
  console.log(`   🆕 신규: ${results.created}개`);
  console.log(`   ✏️  수정: ${results.updated}개`);
  console.log(`   🗑️  삭제: ${results.deleted}개`);
  console.log(`   ⏭️  스킵: ${results.skipped}개\n`);

  return results;
}

// ── 단일 페이지 웹훅 처리 ──
async function syncSinglePage(pageId) {
  console.log(`\n=== 웹훅 발행: 단일 페이지 동기화 ===`);
  console.log(`페이지 ID: ${pageId}`);
  console.log(`액션: ${SYNC_ACTION || '자동 감지'}\n`);

  const existingMap = getExistingPageMap();

  try {
    const result = await syncPage(pageId, existingMap);
    console.log(`\n=== 완료: ${result.action} ===\n`);
    return result;
  } catch (err) {
    console.error(`에러 발생: ${err.message}`);
    process.exit(1);
  }
}

// ── 실행 ──
if (SYNC_PAGE_ID) {
  syncSinglePage(SYNC_PAGE_ID).catch(err => {
    console.error('에러 발생:', err.message);
    process.exit(1);
  });
} else {
  syncAll().catch(err => {
    console.error('에러 발생:', err.message);
    process.exit(1);
  });
}
