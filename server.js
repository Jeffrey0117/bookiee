import Fastify from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fastify = Fastify({ logger: true });

/**
 * 解析文章標題，提取分類和標題
 * "特別企劃 01：PC home 30週年特輯" -> { category: "特別企劃", title: "PC home 30週年特輯" }
 */
function parseArticleTitle(raw) {
  // 格式：分類 XX：標題 或 分類：標題
  const patterns = [
    /^(.+?)\s*\d*：(.+)$/,  // 特別企劃 01：標題
    /^(.+?)：(.+)$/,        // Mac專欄：標題
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      return { category: match[1].trim(), title: match[2].trim() };
    }
  }

  // 沒有分類的情況
  return { category: '', title: raw };
}

/**
 * 轉換 data.json 格式為前端需要的格式
 */
function transformData(rawData) {
  const issues = (rawData.details || []).map((detail, index) => {
    // 從標題提取期號和日期
    const titleMatch = detail.title.match(/(\d+)月號\/(\d+)\s+第(\d+)期/);
    const month = titleMatch ? parseInt(titleMatch[1]) : 1;
    const year = titleMatch ? parseInt(titleMatch[2]) : 2025;
    const number = titleMatch ? parseInt(titleMatch[3]) : index + 1;

    // 轉換文章列表
    const articles = (detail.articles || [])
      .filter(title => {
        // 過濾掉太短或固定的項目
        if (title.length < 3) return false;
        if (['封面', '目錄'].includes(title)) return false;

        // 過濾掉沒有實質標題的項目（短標題且沒有冒號）
        const noContentTitles = [
          '新產品情報', '熱門影劇', '影音在線', '先睹為快', 'Dr. J', 'Dr.J'
        ];
        if (noContentTitles.includes(title)) return false;

        // 保留編者的話、新聞快遞（這些有內容可以生成）
        const keepTitles = ['編者的話', '新聞快遞'];
        if (keepTitles.includes(title)) return true;

        // 保留有冒號分隔的標題（有明確分類和標題）
        // 或標題夠長的（> 10 字）
        const hasColon = title.includes('：') || title.includes(':');
        if (!hasColon && title.length < 10) return false;

        return true;
      })
      .map((rawTitle, artIndex) => {
        const { category, title } = parseArticleTitle(rawTitle);
        return {
          id: `article-${artIndex}`,
          category: category || '本期內容',
          title,
          rawTitle,
          excerpt: '',  // 之後由 AI 生成
          author: 'PC home 編輯部',
          date: detail.publishDate?.replace(/\//g, '.') || '',
          readTime: '5 分鐘',
          content: []  // 之後由 AI 生成
        };
      });

    return {
      id: `issue-${year}-${month}`,
      number,
      year,
      month,
      title: detail.title.replace(/PC home 電腦家庭\s*/, '').trim() || `${month}月號 第${number}期`,
      description: detail.description || `探索本期精彩內容`,
      cover: detail.cover,
      date: `${year}年${month}月號`,
      publishDate: detail.publishDate,
      articles,
      url: detail.url
    };
  });

  return { issues };
}

/**
 * 載入並合併生成的文章內容
 */
async function loadGeneratedArticles() {
  try {
    const generated = JSON.parse(await fs.readFile('generated.json', 'utf-8'));
    return generated.articles || [];
  } catch {
    return [];
  }
}

// API: 取得所有期刊資料
fastify.get('/api/issues', async (request, reply) => {
  try {
    const rawData = JSON.parse(await fs.readFile('data.json', 'utf-8'));
    const transformed = transformData(rawData);
    const generatedArticles = await loadGeneratedArticles();

    // 合併已生成的文章內容
    if (generatedArticles.length > 0 && transformed.issues.length > 0) {
      const firstIssue = transformed.issues[0];
      for (const genArt of generatedArticles) {
        const found = firstIssue.articles.find(a => a.rawTitle === genArt.title || a.title === genArt.title);
        if (found) {
          found.excerpt = genArt.content.slice(0, 100) + '...';
          found.content = [{ type: 'paragraph', text: genArt.content }];
        }
      }
    }

    return transformed;
  } catch (error) {
    reply.code(500).send({ error: '讀取資料失敗', message: error.message });
  }
});

// API: 取得原始爬蟲資料
fastify.get('/api/raw', async (request, reply) => {
  const data = JSON.parse(await fs.readFile('data.json', 'utf-8'));
  return data;
});

// API: 取得 HN 每日精選
fastify.get('/api/hn', async (request, reply) => {
  try {
    const data = JSON.parse(await fs.readFile('hn-daily.json', 'utf-8'));
    return data;
  } catch (error) {
    reply.code(500).send({ error: '讀取 HN 資料失敗', message: error.message });
  }
});

// HN 每日精選（轉換成雜誌格式）
fastify.get('/api/hn/issues', async (request, reply) => {
  try {
    const data = JSON.parse(await fs.readFile('hn-daily.json', 'utf-8'));

    // 轉換成雜誌格式
    const issue = {
      id: `hn-${data.date}`,
      number: 1,
      year: parseInt(data.date.split('-')[0]),
      month: parseInt(data.date.split('-')[1]),
      title: 'Hacker News 每日精選',
      description: '科技圈最熱門的話題，AI 翻譯與深度解析',
      cover: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=800&fit=crop',
      date: data.date,
      articles: data.stories.map((s, i) => {
        // 組合文章內容
        const contentBlocks = [];

        // 原文連結區塊
        contentBlocks.push({
          type: 'paragraph',
          text: `📎 **原文連結**：[${s.title}](${s.url})\n🔥 熱度：${s.score} 分 ｜ 💬 ${s.comments} 則討論 ｜ [HN 討論串](${s.hnUrl})`
        });

        // 主要翻譯內容
        if (s.content) {
          contentBlocks.push({ type: 'paragraph', text: s.content });
        }

        // 名詞解釋
        if (s.glossary) {
          contentBlocks.push({
            type: 'heading',
            text: '📚 名詞解釋'
          });
          contentBlocks.push({
            type: 'paragraph',
            text: s.glossary
          });
        }

        // 編輯觀點
        if (s.insight) {
          contentBlocks.push({
            type: 'blockquote',
            text: `💡 編輯觀點：${s.insight}`
          });
        }

        return {
          id: `hn-${s.id}`,
          category: s.hasOriginal ? `#${i + 1} 翻譯` : `#${i + 1} 精選`,
          title: s.titleZh || s.title,
          rawTitle: s.title,
          excerpt: s.summary || '',
          author: s.author,
          date: data.date,
          readTime: `${Math.ceil((s.content?.length || 300) / 400)} 分鐘`,
          score: s.score,
          comments: s.comments,
          url: s.url,
          hnUrl: s.hnUrl,
          content: contentBlocks
        };
      })
    };

    return { issues: [issue] };
  } catch (error) {
    reply.code(500).send({ error: '讀取 HN 資料失敗', message: error.message });
  }
});

// HN 每日精選頁面（使用雜誌版型）
fastify.get('/hn', async (request, reply) => {
  try {
    const html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');

    // 修改標題和載入 HN 資料
    const injectedHtml = html
      .replace('<title>FLUX — 數位生活誌</title>', '<title>HN Daily — Hacker News 每日精選</title>')
      .replace('FLUX<span>.</span> 數位生活誌', 'HN<span>.</span> Daily')
      .replace('探索科技與生活的交匯點，每一期都是新的靈感旅程', 'Hacker News 熱門話題・繁體中文深度解析')
      .replace('FLUX<span style="color:var(--color-accent)">.</span>', 'HN<span style="color:var(--color-accent)">.</span>')
      .replace("document.addEventListener('DOMContentLoaded', () => Magazine.init());",
        `document.addEventListener('DOMContentLoaded', async () => {
          await Magazine.loadFromJSON('/api/hn/issues');
        });`);

    reply.type('text/html').send(injectedHtml);
  } catch (error) {
    reply.code(500).send({ error: '讀取頁面失敗', message: error.message });
  }
});

// 首頁 - 專案介紹
fastify.get('/', async (request, reply) => {
  const html = await fs.readFile(path.join(__dirname, 'home.html'), 'utf-8');
  reply.type('text/html').send(html);
});

// PC home 雜誌
fastify.get('/pchome', async (request, reply) => {
  const html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');

  // 注入從 API 載入資料的程式碼
  const injectedHtml = html.replace(
    'document.addEventListener(\'DOMContentLoaded\', () => Magazine.init());',
    `document.addEventListener('DOMContentLoaded', async () => {
      await Magazine.loadFromJSON('/api/issues');
    });`
  );

  reply.type('text/html').send(injectedHtml);
});

// 啟動
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log('\\n🚀 Server 跑起來了: http://localhost:3000\\n');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
