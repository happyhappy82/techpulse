/**
 * TechPulse - Notion → Markdown 자동 변환 스크립트
 * Notion DB에서 Published 글을 모두 가져와 .md 파일로 저장 (노파싱 방식)
 *
 * 사용법:
 *   node scripts/sync-notion.cjs                    # DB 전체 Published 글 동기화
 *   node scripts/sync-notion.cjs <PAGE_ID>          # 특정 페이지만 변환
 */

const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');
const fs = require('fs');
const path = require('path');

// .env 파일 로드
const envPath = require('path').join(__dirname, '..', '.env');
if (require('fs').existsSync(envPath)) {
  const envContent = require('fs').readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const NOTION_API_KEY = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_API_KEY || !DATABASE_ID) {
  console.error('NOTION_TOKEN 또는 NOTION_DATABASE_ID 환경변수가 설정되지 않았습니다.');
  console.error('.env 파일을 확인하세요.');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

// 단일 페이지 변환
async function syncPage(pageId) {
  console.log(`\n--- 페이지 변환 중 (${pageId}) ---`);

  const page = await notion.pages.retrieve({ page_id: pageId });

  const title = page.properties.Title?.title?.[0]?.plain_text || '제목 없음';
  const date = page.properties.Date?.date?.start || new Date().toISOString().split('T')[0];
  const excerpt = page.properties.Excerpt?.rich_text?.[0]?.plain_text || '';
  const slug = page.properties.Slug?.rich_text?.[0]?.plain_text || '';
  const tags = page.properties.Tags?.multi_select?.map(t => t.name) || [];

  console.log(`   제목: ${title}`);
  console.log(`   Slug: ${slug || '(비어있음)'}`);
  console.log(`   태그: ${tags.join(', ') || '(없음)'}`);

  // notion-to-md로 마크다운 변환
  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdBlocks);
  const markdownContent = typeof mdString === 'string' ? mdString : mdString.parent;

  console.log(`   마크다운 길이: ${markdownContent.length}자`);

  // frontmatter 생성
  const dateFormatted = date.split('T')[0];
  const autoExcerpt = excerpt || markdownContent.substring(0, 150).replace(/[#*\n]/g, '').trim() + '...';
  const fileSlug = slug || title.replace(/\s+/g, '-').toLowerCase();

  const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
description: "${autoExcerpt.replace(/"/g, '\\"')}"
publishedAt: "${dateFormatted}"
author: "TechPulse"
tags: [${tags.map(t => `"${t}"`).join(', ')}]
notionPageId: "${pageId}"
---`;

  const fullContent = `${frontmatter}\n\n${markdownContent}`;

  // posts 폴더에 저장
  const outputDir = path.join(__dirname, '..', 'src', 'content', 'posts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${fileSlug}.md`);
  fs.writeFileSync(outputPath, fullContent, 'utf-8');
  console.log(`   저장: ${outputPath}`);

  return { title, fileSlug, outputPath };
}

// DB에서 모든 Published 글 가져와서 동기화
async function syncAll() {
  console.log('\n=== Notion DB 전체 동기화 시작 ===\n');

  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: 'Status',
      status: {
        equals: 'Published',
      },
    },
    sorts: [
      { property: 'Date', direction: 'descending' },
    ],
  });

  const pages = response.results;
  console.log(`Published 글 ${pages.length}개 발견\n`);

  const results = [];
  for (const page of pages) {
    try {
      const result = await syncPage(page.id);
      results.push(result);
    } catch (err) {
      console.error(`   에러: ${err.message}`);
    }
  }

  console.log(`\n=== 동기화 완료: ${results.length}/${pages.length}개 성공 ===\n`);
  return results;
}

// 실행
const singlePageId = process.argv[2];
if (singlePageId) {
  syncPage(singlePageId).catch(err => {
    console.error('에러 발생:', err.message);
    process.exit(1);
  });
} else {
  syncAll().catch(err => {
    console.error('에러 발생:', err.message);
    process.exit(1);
  });
}
