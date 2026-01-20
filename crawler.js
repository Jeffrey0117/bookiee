import puppeteer from 'puppeteer';
import fs from 'fs/promises';

const PUBLISHER_URL = 'https://readmoo.com/publisher/19';

/**
 * 抓取出版社頁面的所有雜誌列表
 */
async function crawlPublisherPage(browser, url = PUBLISHER_URL) {
  console.log(`\n📚 抓取出版社頁面: ${url}`);
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('.book-cover, .rm-book-item, [class*="book"]', { timeout: 10000 }).catch(() => {});

  // 滾動載入更多
  await autoScroll(page);

  const books = await page.evaluate(() => {
    const items = [];

    // 嘗試多種選擇器
    const selectors = [
      '.rm-book-item',
      '.book-item',
      '[class*="book-cover"]',
      'a[href*="/book/"]'
    ];

    let elements = [];
    for (const sel of selectors) {
      elements = document.querySelectorAll(sel);
      if (elements.length > 0) break;
    }

    elements.forEach(el => {
      const link = el.href || el.querySelector('a')?.href || '';
      const img = el.querySelector('img');
      const title = el.querySelector('[class*="title"], h3, h4, .book-title')?.textContent?.trim()
                    || img?.alt
                    || '';
      const cover = img?.src || img?.dataset?.src || '';
      const price = el.querySelector('[class*="price"], .rm-price')?.textContent?.trim() || '';

      if (link.includes('/book/')) {
        items.push({
          title,
          url: link,
          cover,
          price,
          bookId: link.match(/\/book\/(\d+)/)?.[1] || ''
        });
      }
    });

    return items;
  });

  await page.close();
  console.log(`✅ 找到 ${books.length} 本書/雜誌`);
  return books;
}

/**
 * 抓取單本書籍的詳細資訊
 */
async function crawlBookDetail(browser, url) {
  console.log(`\n📖 抓取書籍詳情: ${url}`);
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('h1, [class*="title"]', { timeout: 10000 }).catch(() => {});

  const detail = await page.evaluate(() => {
    // 書名
    const title = document.querySelector('h1')?.textContent?.trim() || '';

    // 封面 (高解析度)
    const coverImg = document.querySelector('.book-cover img, [class*="cover"] img');
    const cover = coverImg?.src || '';

    // 作者 - 找 author 連結
    const authorLink = document.querySelector('a[href*="/author/"]');
    const author = authorLink?.textContent?.trim() || '';

    // 出版社 - 找 publisher 連結
    const publisherLink = document.querySelector('a[href*="/publisher/"]');
    const publisher = publisherLink?.textContent?.trim() || '';

    // 價格 - 從頁面文字中抓取
    const pageText = document.body.innerText;
    const priceMatch = pageText.match(/電子書售價：NT\$\s*(\d+)/);
    const originalPriceMatch = pageText.match(/紙本書定價：NT\$\s*(\d+)/);
    const price = priceMatch ? parseInt(priceMatch[1]) : null;
    const originalPrice = originalPriceMatch ? parseInt(originalPriceMatch[1]) : null;

    // 簡介 - 找書籍介紹區塊
    let description = '';
    const introSection = document.querySelector('.rm-story, [class*="intro"], [class*="description"], .book-intro');
    if (introSection) {
      description = introSection.textContent?.trim() || '';
    }

    // 書籍資訊區塊
    const infoText = document.body.innerText;

    // 出版日期
    const dateMatch = infoText.match(/出版日期[：:]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
    const publishDate = dateMatch ? dateMatch[1] : '';

    // ISBN
    const isbnMatch = infoText.match(/ISBN[：:]\s*(\d{13}|\d{10})/);
    const isbn = isbnMatch ? isbnMatch[1] : '';

    // 語言
    const langMatch = infoText.match(/語言[：:]\s*([^\n]+)/);
    const language = langMatch ? langMatch[1].trim() : '';

    // 頁數
    const pageMatch = infoText.match(/(\d+)\s*頁/);
    const pages = pageMatch ? parseInt(pageMatch[1]) : null;

    // 目錄 - 嘗試多種選擇器
    const toc = [];
    const tocItems = document.querySelectorAll('.toc-item, [class*="catalog"] li, [class*="chapter"]');
    tocItems.forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length < 200) toc.push(text);
    });

    return {
      title,
      cover,
      author,
      publisher,
      price,
      originalPrice,
      description: description.slice(0, 1000), // 限制長度
      publishDate,
      isbn,
      language,
      pages,
      toc,
      url: window.location.href
    };
  });

  await page.close();
  console.log(`✅ 書名: ${detail.title}`);
  return detail;
}

/**
 * 自動滾動頁面載入更多內容
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight || totalHeight > 10000) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}

/**
 * 主程式
 */
async function main() {
  console.log('🚀 啟動 Readmoo 爬蟲...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // 1. 抓取出版社頁面的書籍列表
    const books = await crawlPublisherPage(browser);

    // 2. 抓取前 3 本書的詳細資訊（測試用）
    const details = [];
    const testBooks = books.slice(0, 3);

    for (const book of testBooks) {
      if (book.url) {
        const detail = await crawlBookDetail(browser, book.url);
        details.push(detail);
        // 避免請求太快
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // 3. 儲存結果
    const result = {
      crawledAt: new Date().toISOString(),
      publisherUrl: PUBLISHER_URL,
      totalBooks: books.length,
      books,
      details
    };

    await fs.writeFile('data.json', JSON.stringify(result, null, 2), 'utf-8');
    console.log('\n💾 資料已儲存至 data.json');

    // 輸出摘要
    console.log('\n📊 抓取摘要:');
    console.log(`   - 書籍列表: ${books.length} 本`);
    console.log(`   - 詳細資訊: ${details.length} 本`);

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  } finally {
    await browser.close();
    console.log('\n✨ 爬蟲結束');
  }
}

main();
