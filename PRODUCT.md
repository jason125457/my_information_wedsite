# Personal Feed — Product Specification

> Status: MVP draft
> Last updated: 2026-09-10
> Product mode: Single user

## 1. Product Vision

Personal Feed 是一個個人化 AI 資訊篩選工具。核心目的不是讓使用者看到更多資訊，而是讓 AI 過濾掉大部分不重要、重複、低價值的資訊，只留下真正值得看的內容。

產品希望取代部分 Threads／Reddit 無限滑動式的資訊攝取，讓使用者仍能掌握重要資訊、探索興趣，同時降低資訊過載。

## 2. Target User

MVP 只服務單一使用者，不考慮：

- 公開註冊
- 多使用者與團隊
- SaaS 與計費
- 社交功能

## 3. Main Topics

系統追蹤七個主要分類。

### 3.1 AI / LLM

高興趣：

- OpenAI／ChatGPT 新功能
- Claude／Anthropic
- Gemini／Google AI
- AI Agent
- Codex／AI Coding
- 新 AI 工具
- AI 實際應用案例
- AI 對工作與生活的影響

中興趣：

- Benchmark
- 模型比較
- AI 公司重大商業消息
- GPU／AI infrastructure

低興趣：

- 純學術論文
- 過度底層的模型研究

### 3.2 Cybersecurity

偏向「值得知道的資安事件」，不追求 CVE 第一時間通知。

主要內容：

- 大型駭客攻擊與重大企業入侵
- 勒索軟體與供應鏈攻擊
- 有趣的新攻擊手法
- Red Team／Blue Team 技術
- 資安產業重大變化
- 與企業資安相關的新技術

不特別追蹤：

- 每日大量 CVE
- 一般設備 Patch Alert
- 純工作用途的漏洞通知

### 3.3 Technology

主要內容：

- Apple／Google／Microsoft 等重大消息
- 新科技產品、PC／GPU
- App 與網路服務
- 新創公司與科技產業趨勢
- 值得注意的新技術

降低權重：

- 小道消息
- 無可靠來源的產品 Leak
- 每日瑣碎產品傳聞

### 3.4 Investment / Finance

主要內容：

- 台股／美股重大事件
- Federal Reserve、利率、CPI／通膨與就業數據
- AI／半導體產業
- 市場重大上漲或下跌的原因
- ETF／長期投資
- 值得理解的產業趨勢

避免：

- 明牌與短線喊單
- 「明天必漲股票」
- 無基本依據的市場預測

### 3.5 Major World Events

只留下真正重要的國際事件，例如：

- 戰爭與重大衝突
- 選舉與政權變化
- 大型自然災害
- 全球重要政策
- 重大外交事件
- 影響世界經濟的重要事件

不為了填滿分類而每天強制提供內容。

### 3.6 Shoegaze / Dream Pop / Indie Rock

此分類以探索為主：

- 新樂團、Single、專輯與小眾樂團
- Reddit 樂團推薦
- YouTube Live Session
- Bandcamp 與樂團訪談
- Shoegaze／Nu-gaze／Dream Pop 趨勢
- 台灣、日本、中國、歐美 Indie Scene

內容不受時效限制；即使發布於數年前，只要仍有探索價值即可推薦。

### 3.7 Photography

主要內容：

- 攝影作品與攝影師作品
- Street Photography、夜景、星空、城市與風景攝影
- Lightroom／後製
- 相機／鏡頭重大新品
- 拍攝觀念

特別加入 Taiwan Photography Locations，探索：

- 台灣攝影景點與特殊攝影點
- 日出、日落、火燒雲、夜景、星空、銀河與雲海
- 櫻花、芒草、楓葉及其他季節性景色

此類內容同樣不限制發布時間。

## 4. Content Model

Personal Feed 同時包含兩種內容型態。

### Current

回答「今天發生什麼」，主要涵蓋 AI、Cybersecurity、Technology、Investment 與 World Events，時間範圍以過去 24～48 小時為主。

### Discovery

回答「今天 AI 幫你挖到什麼」，例如新樂團、值得聽的歌、台灣攝影點、Reddit 討論、YouTube 影片、AI 工具與優質文章。Discovery 不限制內容發布時間。

## 5. Daily Feed Volume

MVP 採 Loose Filtering Mode，每天目標為 15～20 則，但不為達到數量而塞入低品質內容。若當天只有 13 則值得看，就只顯示 13 則。

不同分類沒有固定配額，內容依實際品質分配。

## 6. Content Sources

MVP 支援：

- RSS／Atom 與官方 Blog
- Reddit 官方 API
- Hacker News 官方 API
- YouTube Data API；RSS 可作低成本備援
- 主流新聞與財經媒體的官方 RSS／API
- Bandcamp／音樂媒體
- 台灣攝影 Blog／網站
- OpenAI Web Search（Discovery）

第一版暫不處理 Threads、Instagram、TikTok 與 X。

## 7. Source Strategy

每日結果以約 80% Known Sources、20% Discovery Sources 為方向，不是硬性配額。

Known Sources 包括官方 Blog、已知 Reddit communities、Hacker News、已知 YouTube Channels 與主流新聞來源。

Discovery Sources 由 AI 主動探索新網站、Reddit 討論、YouTube 頻道、樂團、攝影文章、AI 工具與 Blog。優質的新來源未來可增加推薦權重。

## 8. Source Reliability

系統必須記錄來源類型，例如 Official、Original Reporting、Major Media、Known Blog、Community、Reddit 與 Unknown Source。

AI 摘要必須區分「官方確認」與「網路社群正在討論」，不能將兩者視為相同可信度。

## 9. AI Ranking

每則內容由 AI 評估：

- Interest Relevance
- Information Value
- Importance
- Freshness
- Discussion Popularity
- Discovery Value

不同分類使用不同權重。例如：

- World News：Importance 與 Freshness 優先
- Music：Interest 與 Discovery 高於 Freshness
- Photography Locations：Discovery 遠高於 Freshness

## 10. Topic Weight

使用者可以手動設定每個分類的 1～5 權重。初始值：

| Topic | Weight |
| --- | ---: |
| AI / LLM | 5 |
| Cybersecurity | 2 |
| Technology | 4 |
| Investment / Finance | 3 |
| World Events | 4 |
| Music | 5 |
| Photography | 4 |

Topic Weight 影響推薦排序，不代表固定文章配額。

## 11. Home Page

首頁採 Hybrid Design。`For You` 將所有分類依推薦分數混合呈現，上方提供 AI、Cybersecurity、Technology、Finance、World、Music 與 Photography 快速切換。

主要導覽另包含 Daily Digest、Saved、Read Later 與 History。

## 12. Feed Card

首頁卡片保持簡潔，每張卡包含：

- Title：原始標題或忠於原意的合理整理
- Summary：AI 產生的 2～3 句摘要
- Why You Might Like This：一句說明為何值得看
- Metadata：Source、Publish Time、Topic、Content Type
- Actions：View Original、Read Later、Save、Not Interested

## 13. Original Source

所有內容都必須保留可點擊的原始來源連結，包括官方網站、Reddit Thread、YouTube、Bandcamp、原始新聞與 Blog。AI 是編輯，不取代原始來源。

## 14. Read Status

文章具有 Unread 與 Read 狀態。Read 卡片以灰框或較低視覺對比顯示。使用者點擊 View Original 後，自動標記為 Read，並在新分頁開啟原始來源。

## 15. Read Later and Saved

- Read Later：現在沒時間，但之後想看。
- Saved：值得長期保留，並進入個人知識庫。

兩者必須是分離的狀態。

## 16. Saved Knowledge Base

收藏內容保存 Title、Original URL、AI Summary、Topic、Source、Saved Date 與 Tags。

MVP 支援 Keyword Search、Topic Filter、Tag Filter、Date Filter 與 Source Filter。Semantic Search、AI Q&A 與 RAG 延後至 V2。

## 17. Feedback Learning

Save 表示使用者喜歡或認為內容有價值。

Not Interested 可選原因：

- 主題沒興趣
- 太八卦／太廢
- 太技術
- 已經知道
- 來源品質差
- 不想再看到這種類型

系統應依 Save、Not Interested 與閱讀行為調整 Ranking。MVP 使用 Explicit Feedback、規則式調整與 AI Ranking，不建立複雜的機器學習推薦模型。

## 18. Deduplication

同一事件可能同時出現在官方 Blog、Reddit、Hacker News、新聞與 YouTube。系統必須進行事件去重：同一事件只顯示一張主卡，並顯示如 `+3 sources` 的其他來源入口。

主來源原則上依 Official、Original Reporting、Major Media、Community 的順序選擇。若其他內容提供明顯不同的分析或新增資訊，仍可獨立保留。

## 19. Daily Digest

系統平常持續更新 Feed，並於每日 22:00（Asia/Taipei）產生 Daily Digest。Digest 約 15～20 則，由近期重要資訊、Discovery Content 與 AI Ranking 共同決定；品質門檻優先於數量。

## 20. LINE Notification

建立獨立 LINE Official Account，使用 LINE Messaging API。Daily Digest 完成後推送簡短通知，例如「今天有 17 則值得你看 👀」，附上分類數量與「查看今日 Digest」連結。

MVP 不做 conversational chatbot。可保留只用於 LINE 驗證與首次綁定 userId 的最小 webhook；一般使用流程不依賴聊天互動。

## 21. Weekly Review

每週日傍晚產生 Weekly Review，內容包含：

- 本週最值得記住的 5～10 件事
- 收藏最多的主題
- 最常閱讀與常被略過的內容
- 本週發現的新樂團、攝影景點與 AI 工具
- 尚未完成的 Read Later
- 一段 AI Weekly Summary，說明本週資訊攝取集中方向

整體應能在約 5 分鐘內讀完。

## 22. Authentication

MVP 採 Single User Mode，以 Supabase Auth Magic Link 保護，只允許 `ALLOWED_EMAIL` 指定的 email。禁止公開註冊，不建立一般帳號管理功能。

## 23. Product Philosophy

- **Less, But Better**：不為內容數量降低品質。
- **No Infinite Scroll Addiction**：使用 Load More 或分頁，不刻意延長 session。
- **Original Sources Matter**：永遠提供原始來源。
- **AI Is the Editor**：AI 負責搜尋、整理、過濾與排序，不創造不存在的資訊。
- **Discovery Matters**：主動找出使用者原本不知道但可能喜歡的內容。
- **User Feedback Matters**：依 Save、Not Interested 與閱讀行為逐漸個人化。

## 24. MVP Success Criteria

第一版成功標準不是功能數量，而是使用者是否願意每天打開 Personal Feed，而不是打開 Threads 找資訊。

若每天花 10～20 分鐘即可掌握重要資訊並探索興趣，就達到產品核心目的。

## 25. Out of Scope for MVP

- Threads、Instagram、TikTok、X 整合
- 多人帳號、團隊與社交功能
- AI Semantic Search、收藏內容 RAG、AI Q&A
- LINE conversational chatbot
- 自動交易與投資建議
- 即時 CVE Alert
- Native iOS／Android App
