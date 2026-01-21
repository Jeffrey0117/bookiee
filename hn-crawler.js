import { deepseek } from 'meei';
import fs from 'fs/promises';

const HN_API = 'https://hacker-news.firebaseio.com/v0';

/**
 * 抓取原文內容
 */
async function fetchArticleContent(url) {
  try {
    // 跳過 GitHub、PDF 等不好抓的來源
    if (url.includes('github.com') || url.endsWith('.pdf')) {
      return null;
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeout: 10000
    });

    if (!res.ok) return null;

    const html = await res.text();

    // 簡單提取正文（移除 HTML 標籤，取主要內容）
    let text = html
      // 移除 script, style, nav, header, footer
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      // 保留段落結構
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      // 移除所有其他標籤
      .replace(/<[^>]+>/g, ' ')
      // 清理空白
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();

    // 取前 3000 字（避免太長）
    if (text.length > 3000) {
      text = text.slice(0, 3000) + '...';
    }

    // 太短的內容可能抓取失敗
    if (text.length < 200) return null;

    return text;
  } catch (error) {
    console.log(`   ⚠️ 無法抓取原文: ${error.message}`);
    return null;
  }
}

/**
 * 抓取 HN Top Stories
 */
async function fetchTopStories(limit = 10) {
  console.log(`📡 抓取 Hacker News Top ${limit}...\n`);

  const res = await fetch(`${HN_API}/topstories.json`);
  const ids = await res.json();

  const stories = [];
  for (const id of ids.slice(0, limit)) {
    const itemRes = await fetch(`${HN_API}/item/${id}.json`);
    const item = await itemRes.json();

    if (item && item.type === 'story') {
      stories.push({
        id: item.id,
        title: item.title,
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        score: item.score,
        author: item.by,
        comments: item.descendants || 0,
        time: new Date(item.time * 1000).toISOString(),
        hnUrl: `https://news.ycombinator.com/item?id=${item.id}`
      });
      console.log(`   ${stories.length}. ${item.title.slice(0, 50)}... (${item.score} pts)`);
    }
  }

  return stories;
}

/**
 * AI 翻譯原文 + 加上觀點
 */
async function translateArticle(story, originalContent) {
  // 有原文：完整翻譯
  if (originalContent) {
    const prompt = `你是資深科技翻譯編輯，請將以下英文科技文章「完整翻譯」成繁體中文。

原文標題：${story.title}
原文內容：
${originalContent}

翻譯要求：
1. **完整翻譯**：盡可能翻譯原文全部內容，不要只做摘要
2. **專有名詞處理**：遇到技術名詞，格式為「中文翻譯（原文）」，例如：容器化（Containerization）、網狀網路（Mesh Network）
3. **保持段落結構**：用空行分隔段落
4. **流暢自然**：用台灣繁體中文的說法，不要太生硬

請輸出：
標題：（準確翻譯，可加副標說明）
摘要：（一句話，30字內）
翻譯：
（完整翻譯內容，保持原文結構，500-1000字）

名詞解釋：
- 名詞1：簡短解釋
- 名詞2：簡短解釋
（列出 3-5 個重要專有名詞的解釋）

觀點：（50字內，這篇為什麼值得關注）`;

    try {
      const response = await deepseek(prompt, { model: 'chat' });
      const result = { hasOriginal: true };

      const titleMatch = response.match(/標題：(.+?)(?:\n|摘要)/s);
      if (titleMatch) result.titleZh = titleMatch[1].trim();

      const summaryMatch = response.match(/摘要：(.+?)(?:\n|翻譯)/s);
      if (summaryMatch) result.summary = summaryMatch[1].trim();

      const contentMatch = response.match(/翻譯：\n?([\s\S]+?)(?:\n名詞解釋|$)/);
      if (contentMatch) result.content = contentMatch[1].trim();

      const glossaryMatch = response.match(/名詞解釋：\n?([\s\S]+?)(?:\n觀點|$)/);
      if (glossaryMatch) result.glossary = glossaryMatch[1].trim();

      const insightMatch = response.match(/觀點：(.+?)$/s);
      if (insightMatch) result.insight = insightMatch[1].trim();

      return result;
    } catch (error) {
      console.error(`   ❌ 翻譯失敗: ${error.message}`);
      return null;
    }
  }

  // 沒有原文：根據標題生成介紹
  const prompt = `你是科技記者，請根據以下 Hacker News 熱門文章標題，撰寫一篇介紹。

原文標題：${story.title}
來源：${story.url}
熱度：${story.score} 分，${story.comments} 則留言

請輸出：
1. 中文標題（翻譯+意譯）
2. 一句話摘要（30字內）
3. 介紹文章（根據標題推測內容，300-400字，說明這是什麼、技術背景、為什麼值得關注）
4. 相關名詞解釋（3-5 個）

格式：
標題：xxx
摘要：xxx
內容：
xxx

名詞解釋：
- 名詞1：解釋
- 名詞2：解釋`;

  try {
    const response = await deepseek(prompt, { model: 'chat' });
    const result = { hasOriginal: false };

    const titleMatch = response.match(/標題：(.+?)(?:\n|摘要)/s);
    if (titleMatch) result.titleZh = titleMatch[1].trim();

    const summaryMatch = response.match(/摘要：(.+?)(?:\n|內容)/s);
    if (summaryMatch) result.summary = summaryMatch[1].trim();

    const contentMatch = response.match(/內容：\n?([\s\S]+?)(?:\n名詞解釋|$)/);
    if (contentMatch) result.content = contentMatch[1].trim();

    const glossaryMatch = response.match(/名詞解釋：\n?([\s\S]+?)$/);
    if (glossaryMatch) result.glossary = glossaryMatch[1].trim();

    return result;
  } catch (error) {
    console.error(`   ❌ 生成失敗: ${error.message}`);
    return null;
  }
}

/**
 * 主程式
 */
async function main() {
  console.log('🔥 Hacker News 每日精選\n');
  console.log('='.repeat(50) + '\n');

  // 1. 抓取 Top 10
  const stories = await fetchTopStories(10);
  console.log(`\n✅ 抓到 ${stories.length} 篇\n`);

  // 2. 抓取原文 + AI 翻譯
  console.log('🤖 開始抓取原文並翻譯...\n');

  const translated = [];
  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    console.log(`[${i + 1}/${stories.length}] ${story.title.slice(0, 40)}...`);

    // 先抓原文
    console.log(`   📥 抓取原文...`);
    const originalContent = await fetchArticleContent(story.url);

    if (originalContent) {
      console.log(`   ✅ 抓到 ${originalContent.length} 字原文`);
    } else {
      console.log(`   ⚠️ 無法抓取原文，將根據標題生成`);
    }

    // AI 翻譯/生成
    console.log(`   🔄 AI 處理中...`);
    const result = await translateArticle(story, originalContent);

    if (result) {
      translated.push({
        ...story,
        ...result
      });
      const label = result.hasOriginal ? '翻譯' : '生成';
      console.log(`   ✅ ${label}完成: ${result.titleZh?.slice(0, 25)}...`);
      console.log(`   📝 ${result.content?.length || 0} 字\n`);
    }

    // 避免太快
    await new Promise(r => setTimeout(r, 2000));
  }

  // 3. 儲存結果
  const result = {
    date: new Date().toISOString().split('T')[0],
    generatedAt: new Date().toISOString(),
    count: translated.length,
    stories: translated
  };

  await fs.writeFile('hn-daily.json', JSON.stringify(result, null, 2), 'utf-8');

  // 4. 輸出預覽
  console.log('\n' + '='.repeat(50));
  console.log('📰 今日精選預覽\n');

  translated.forEach((s, i) => {
    console.log(`${i + 1}. ${s.titleZh || s.title}`);
    console.log(`   ${s.summary || ''}`);
    console.log(`   🔥 ${s.score} pts | 💬 ${s.comments}`);
    console.log();
  });

  console.log(`\n💾 已儲存至 hn-daily.json`);
}

main();
