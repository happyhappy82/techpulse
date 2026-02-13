import { Client } from '@notionhq/client';
import type {
  PageObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';

const notion = new Client({
  auth: import.meta.env.NOTION_TOKEN,
});

const databaseId = import.meta.env.NOTION_DATABASE_ID;

// Notion 페이지 타입
export interface NotionPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  tags: string[];
  status: string;
}

// 데이터베이스에서 Published 게시글 가져오기
export async function getPublishedPosts(): Promise<NotionPost[]> {
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Status',
      status: {
        equals: 'Published',
      },
    },
    sorts: [
      {
        property: 'Date',
        direction: 'descending',
      },
    ],
  });

  return response.results
    .filter((page): page is PageObjectResponse => 'properties' in page)
    .map(pageToPost);
}

// 모든 게시글 가져오기 (static paths 용)
export async function getAllPosts(): Promise<NotionPost[]> {
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Status',
      status: {
        equals: 'Published',
      },
    },
  });

  return response.results
    .filter((page): page is PageObjectResponse => 'properties' in page)
    .map(pageToPost);
}

// slug로 게시글 찾기
export async function getPostBySlug(slug: string): Promise<NotionPost | null> {
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        {
          property: 'Slug',
          rich_text: {
            equals: slug,
          },
        },
        {
          property: 'Status',
          status: {
            equals: 'Published',
          },
        },
      ],
    },
  });

  const page = response.results[0];
  if (!page || !('properties' in page)) return null;

  return pageToPost(page as PageObjectResponse);
}

// 페이지 블록(본문) 가져오기
export async function getPageBlocks(pageId: string): Promise<BlockObjectResponse[]> {
  const blocks: BlockObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });

    blocks.push(
      ...response.results.filter(
        (block): block is BlockObjectResponse => 'type' in block
      )
    );

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return blocks;
}

// Notion 블록을 HTML로 변환
export function blocksToHtml(blocks: BlockObjectResponse[]): string {
  return blocks.map(blockToHtml).join('\n');
}

function blockToHtml(block: BlockObjectResponse): string {
  switch (block.type) {
    case 'paragraph':
      const pText = richTextToHtml(block.paragraph.rich_text);
      return pText ? `<p>${pText}</p>` : '<p><br/></p>';

    case 'heading_1':
      return `<h1>${richTextToHtml(block.heading_1.rich_text)}</h1>`;

    case 'heading_2':
      return `<h2>${richTextToHtml(block.heading_2.rich_text)}</h2>`;

    case 'heading_3':
      return `<h3>${richTextToHtml(block.heading_3.rich_text)}</h3>`;

    case 'bulleted_list_item':
      return `<li>${richTextToHtml(block.bulleted_list_item.rich_text)}</li>`;

    case 'numbered_list_item':
      return `<li>${richTextToHtml(block.numbered_list_item.rich_text)}</li>`;

    case 'quote':
      return `<blockquote>${richTextToHtml(block.quote.rich_text)}</blockquote>`;

    case 'code':
      const lang = block.code.language || '';
      return `<pre><code class="language-${lang}">${richTextToPlain(block.code.rich_text)}</code></pre>`;

    case 'divider':
      return '<hr/>';

    case 'image': {
      const imageUrl =
        block.image.type === 'external'
          ? block.image.external.url
          : block.image.file.url;
      const caption = block.image.caption?.length
        ? richTextToPlain(block.image.caption)
        : '';
      return `<figure><img src="${imageUrl}" alt="${caption}" loading="lazy"/>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }

    case 'callout': {
      const icon = block.callout.icon?.type === 'emoji' ? block.callout.icon.emoji : '';
      return `<div class="callout">${icon ? `<span class="callout-icon">${icon}</span>` : ''}<div>${richTextToHtml(block.callout.rich_text)}</div></div>`;
    }

    case 'toggle':
      return `<details><summary>${richTextToHtml(block.toggle.rich_text)}</summary></details>`;

    case 'bookmark':
      const url = block.bookmark.url;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="bookmark">${url}</a>`;

    default:
      return '';
  }
}

// RichText를 HTML로 변환
function richTextToHtml(richTexts: any[]): string {
  if (!richTexts || richTexts.length === 0) return '';

  return richTexts
    .map((rt) => {
      let text = rt.plain_text || '';
      // HTML 특수문자 이스케이프
      text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      if (rt.annotations?.bold) text = `<strong>${text}</strong>`;
      if (rt.annotations?.italic) text = `<em>${text}</em>`;
      if (rt.annotations?.strikethrough) text = `<del>${text}</del>`;
      if (rt.annotations?.underline) text = `<u>${text}</u>`;
      if (rt.annotations?.code) text = `<code>${text}</code>`;

      if (rt.href) {
        text = `<a href="${rt.href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }

      return text;
    })
    .join('');
}

// RichText를 플레인텍스트로 변환
function richTextToPlain(richTexts: any[]): string {
  if (!richTexts || richTexts.length === 0) return '';
  return richTexts.map((rt) => rt.plain_text || '').join('');
}

// Notion PageObjectResponse를 NotionPost로 변환
function pageToPost(page: PageObjectResponse): NotionPost {
  const props = page.properties;

  // Title
  const titleProp = props['Title'];
  const title =
    titleProp?.type === 'title'
      ? titleProp.title.map((t: any) => t.plain_text).join('')
      : '';

  // Slug
  const slugProp = props['Slug'];
  const slug =
    slugProp?.type === 'rich_text'
      ? slugProp.rich_text.map((t: any) => t.plain_text).join('')
      : '';

  // Excerpt
  const excerptProp = props['Excerpt'];
  const excerpt =
    excerptProp?.type === 'rich_text'
      ? excerptProp.rich_text.map((t: any) => t.plain_text).join('')
      : '';

  // Date
  const dateProp = props['Date'];
  const date =
    dateProp?.type === 'date' && dateProp.date
      ? dateProp.date.start
      : '';

  // Tags
  const tagsProp = props['Tags'];
  const tags =
    tagsProp?.type === 'multi_select'
      ? tagsProp.multi_select.map((t: any) => t.name)
      : [];

  // Status
  const statusProp = props['Status'];
  const status =
    statusProp?.type === 'status' && statusProp.status
      ? statusProp.status.name
      : '';

  return {
    id: page.id,
    title,
    slug,
    excerpt,
    date,
    tags,
    status,
  };
}
