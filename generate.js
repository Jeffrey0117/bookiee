import { deepseek, gemini, groq, qwen } from 'meei';
import fs from 'fs/promises';

/**
 * 用 AI 生成文章內容
 * 使用多個 provider 平均分配
 */

const providers = {
  qwen: (prompt) => qwen(prompt, { model: 'turbo' }),
  deepseek: (prompt) => deepseek(prompt, { model: 'chat' }),
  groq: (prompt) => groq(prompt, { model: 'llama-3.3-70b-versatile' }),
};

const providerList = ['deepseek', 'groq'];

/**
 * 生成單篇文章內容
 */
async function generateArticle(title, issueTitle, providerName) {
  const prompt = `你是一位專業的科技雜誌編輯，請根據以下文章標題，撰寫一篇約 300-500 字的繁體中文文章。

雜誌期號：${issueTitle}
文章標題：${title}

要求：
1. 內容要專業但易讀，適合一般讀者
2. 可以適當加入具體的數據或例子
3. 語氣要像雜誌文章，不要太生硬
4. 直接輸出文章內容，不要加標題
5. 段落之間用空行分隔

請直接開始撰寫文章內容：`;

  try {
    const generate = providers[providerName];
    const response = await generate(prompt);
    return response;
  } catch (error) {
    console.error(`❌ 生成失敗 [${providerName}]: ${title}`, error.message);
    return null;
  }
}

/**
 * 主程式
 */
async function main() {
  console.log('🤖 使用多個 AI 生成文章...\n');
  console.log(`📋 Providers: ${providerList.join(', ')}\n`);

  // 讀取爬蟲資料
  const data = JSON.parse(await fs.readFile('data.json', 'utf-8'));

  if (!data.details || data.details.length === 0) {
    console.log('❌ 沒有詳細資料，請先執行 npm run crawl');
    return;
  }

  // 讀取已生成的文章
  let existingArticles = [];
  try {
    const existing = JSON.parse(await fs.readFile('generated.json', 'utf-8'));
    existingArticles = existing.articles || [];
    console.log(`📄 已有 ${existingArticles.length} 篇文章\n`);
  } catch {
    console.log('📄 從頭開始生成\n');
  }

  // 取第一期 (360期)
  const issue = data.details[0];
  console.log(`📖 處理: ${issue.title}`);
  console.log(`   文章數: ${issue.articles?.length || 0}\n`);

  if (!issue.articles || issue.articles.length === 0) {
    console.log('❌ 沒有文章列表');
    return;
  }

  // 過濾要生成的文章（跳過已生成的和沒內容的）
  const noContentTitles = ['新產品情報', '熱門影劇', '影音在線', '先睹為快', 'Dr. J', 'Dr.J'];
  const existingTitles = new Set(existingArticles.map(a => a.title));

  const articlesToGenerate = issue.articles.filter(title => {
    if (noContentTitles.includes(title)) return false;
    if (existingTitles.has(title)) return false;
    return true;
  });

  console.log(`✨ 需要生成: ${articlesToGenerate.length} 篇\n`);

  if (articlesToGenerate.length === 0) {
    console.log('✅ 所有文章都已生成！');
    return;
  }

  const generatedArticles = [...existingArticles];

  for (let i = 0; i < articlesToGenerate.length; i++) {
    const title = articlesToGenerate[i];
    const providerName = providerList[i % providerList.length];

    console.log(`✍️  [${i + 1}/${articlesToGenerate.length}] ${providerName.toUpperCase()}: ${title}`);

    const content = await generateArticle(title, issue.title, providerName);

    if (content) {
      generatedArticles.push({
        title,
        content,
        provider: providerName,
        generatedAt: new Date().toISOString()
      });
      console.log(`   ✅ 完成 (${content.length} 字)\n`);
    } else {
      console.log(`   ⚠️  跳過\n`);
    }

    // 避免請求太快
    await new Promise(r => setTimeout(r, 1500));
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
    providers: providerList
  };

  await fs.writeFile('generated.json', JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n💾 已儲存至 generated.json`);
  console.log(`📊 總共 ${generatedArticles.length} 篇文章`);

  // 統計各 provider
  const stats = {};
  generatedArticles.forEach(a => {
    stats[a.provider] = (stats[a.provider] || 0) + 1;
  });
  console.log(`📈 統計:`, stats);
}

main();
