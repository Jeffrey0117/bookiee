import { deepseek } from 'meei';
import fs from 'fs/promises';

const HN_API = 'https://hacker-news.firebaseio.com/v0';

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
 * AI 翻譯並摘要
 */
async function translateAndSummarize(story) {
  const prompt = `你是科技新聞編輯，請將以下 Hacker News 文章資訊翻譯成繁體中文，並加上簡短評論。

標題：${story.title}
來源：${story.url}
熱度：${story.score} 分，${story.comments} 則留言

請輸出：
1. 中文標題（翻譯+意譯，讓台灣讀者好懂）
2. 一句話摘要（30字內說明這是什麼）
3. 為什麼值得關注（50字內，技術觀點或產業影響）

格式：
標題：xxx
摘要：xxx
觀點：xxx`;

  try {
    const response = await deepseek(prompt, { model: 'chat' });

    // 解析回應
    const lines = response.split('\n').filter(l => l.trim());
    const result = {};

    for (const line of lines) {
      if (line.startsWith('標題：')) result.titleZh = line.replace('標題：', '').trim();
      if (line.startsWith('摘要：')) result.summary = line.replace('摘要：', '').trim();
      if (line.startsWith('觀點：')) result.insight = line.replace('觀點：', '').trim();
    }

    return result;
  } catch (error) {
    console.error(`   ❌ 翻譯失敗: ${error.message}`);
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

  // 2. AI 翻譯
  console.log('🤖 開始翻譯...\n');

  const translated = [];
  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    console.log(`[${i + 1}/${stories.length}] ${story.title.slice(0, 40)}...`);

    const translation = await translateAndSummarize(story);

    if (translation) {
      translated.push({
        ...story,
        ...translation
      });
      console.log(`   ✅ ${translation.titleZh?.slice(0, 30)}...\n`);
    }

    // 避免太快
    await new Promise(r => setTimeout(r, 1000));
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
