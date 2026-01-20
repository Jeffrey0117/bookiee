# Bookie 專案發展策略

## 現況
- 爬取 Readmoo 雜誌目錄
- AI 根據標題生成文章（目前是瞎掰，沒有真實資料）

---

## 發展方向

### 方向 A：改善 AI 生成品質
**問題**：純憑標題生成，內容太唬爛

**解法**：
1. **先搜尋再寫** - 用 Google/Bing/Tavily 搜尋標題相關內容，把搜尋結果當 context 餵給 AI
2. **用 Perplexity API** - 內建搜尋，回答有來源引用
3. **SerpAPI / Tavily** - 專門給 AI 用的搜尋 API

**優點**：內容有根據、可引用來源
**缺點**：需要額外 API、成本增加

---

### 方向 B：找能爬到完整文章的資源
**想法**：找已經公開的文章內容來加工

**可能來源**：
1. **英文科技文章** - TechCrunch, The Verge, Ars Technica, Hacker News
2. **開源技術文件** - MDN, dev.to, Medium (部分公開)
3. **RSS Feed** - 很多網站有 RSS 提供全文
4. **學術論文摘要** - arXiv, PubMed

**加工方式**：
- 翻譯成繁體中文
- 摘要重點
- 加入本地化觀點
- 整合多篇成一篇深度報導

**優點**：有真實內容基礎
**缺點**：版權問題需注意、翻譯品質

---

### 方向 C：專注 AI 能寫好的主題
**想法**：AI 本身知識庫就很強的領域

**適合主題**：
1. **程式語言教學** - Python, JavaScript, Rust 入門到進階
2. **開發工具介紹** - VS Code, Git, Docker, CLI 工具
3. **演算法解析** - LeetCode 題解、資料結構教學
4. **技術概念解釋** - API, REST, GraphQL, 微服務
5. **最佳實踐** - Clean Code, Design Patterns, 測試策略
6. **AI/ML 入門** - 機器學習概念、實作教學

**優點**：AI 知識準確、不需外部資料
**缺點**：需要程式碼範例驗證

---

### 方向 D：混合模式
**最佳策略可能是組合**：

```
內容類型          來源策略
─────────────────────────────────
新聞時事          搜尋 API + AI 整理
技術教學          純 AI 生成（強項）
產品評測          爬取規格 + AI 分析
英文文章          翻譯 + 本地化
趨勢分析          搜尋數據 + AI 洞察
```

---

## 下一步 TODO

- [ ] 評估 Perplexity / Tavily API 成本
- [ ] 測試爬取英文科技網站（RSS 優先）
- [ ] 做一個「程式教學」類型的生成測試
- [ ] 設計內容分類系統（新聞/教學/評測/翻譯）

---

## 技術備註

### 已有的 AI Providers (meei)
- deepseek (便宜)
- groq (免費，llama)
- qwen (API key 失效中)
- gemini (有免費額度)

### 可考慮加入
- Perplexity API (搜尋+生成)
- Claude API (長文脈絡強)
- 本地 LLM (Ollama + llama3)
