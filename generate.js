import { deepseek, gemini, groq, qwen } from 'meei';
import fs from 'fs/promises';

/**
 * 用 AI 生成文章內容
 * 便宜選擇：deepseek (最便宜), qwen turbo (便宜), gemini flash (免費額度), groq (免費)
 */

// 選擇 provider: 'deepseek' | 'qwen' | 'gemini' | 'groq'
const PROVIDER = 'qwen';

const providers = {
  deepseek: (prompt) => deepseek(prompt, { model: 'chat' }),
  qwen: (prompt) => qwen(prompt, { model: 'turbo' }),
  gemini: (prompt) => gemini(prompt, { model: 'flash' }),
  groq: (prompt) => groq(prompt, { model: 'llama-3.3-70b-versatile' }),
};

/**
 * 生成單篇文章內容
 */
async function generateArticle(title, issueTitle) {
  const prompt = `你是一位專業的科技雜誌編輯，請根據以下文章標題，撰寫一篇約 300-500 字的繁體中文文章。

雜誌期號：${issueTitle}
文章標題：${title}

要求：
1. 內容要專業但易讀，適合一般讀者
2. 可以適當加入具體的數據或例子
3. 語氣要像雜誌文章，不要太生硬
4. 直接輸出文章內容，不要加標題

請直接開始撰寫文章內容：`;

  try {
    const generate = providers[PROVIDER];
    const response = await generate(prompt);
    return response;
  } catch (error) {
    console.error(`生成失敗: ${title}`, error.message);
    return null;
  }
}

/**
 * 主程式
 */
async function main() {
  console.log(`🤖 使用 ${PROVIDER} 生成文章...\n`);

  // 讀取爬蟲資料
  const data = JSON.parse(await fs.readFile('data.json', 'utf-8'));

  if (!data.details || data.details.length === 0) {
    console.log('❌ 沒有詳細資料，請先執行 npm run crawl');
    return;
  }

  // 取第一期來測試
  const issue = data.details[0];
  console.log(`📖 處理: ${issue.title}`);
  console.log(`   文章數: ${issue.articles?.length || 0}\n`);

  if (!issue.articles || issue.articles.length === 0) {
    console.log('❌ 沒有文章列表');
    return;
  }

  // 測試生成前 3 篇
  const testArticles = issue.articles.slice(0, 3);
  const generatedArticles = [];

  for (const title of testArticles) {
    console.log(`✍️  生成: ${title}`);

    const content = await generateArticle(title, issue.title);

    if (content) {
      generatedArticles.push({
        title,
        content,
        generatedAt: new Date().toISOString()
      });
      console.log(`   ✅ 完成 (${content.length} 字)\n`);
    }

    // 避免請求太快
    await new Promise(r => setTimeout(r, 1000));
  }

  // 儲存結果
  const result = {
    issue: {
      title: issue.title,
      cover: issue.cover,
      publishDate: issue.publishDate
    },
    articles: generatedArticles,
    generatedAt: new Date().toISOString(),
    provider: PROVIDER
  };

  await fs.writeFile('generated.json', JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n💾 已儲存至 generated.json`);
  console.log(`📊 生成了 ${generatedArticles.length} 篇文章`);
}

main();
