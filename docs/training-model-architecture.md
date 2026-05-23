# 模型訓練技術與架構說明

最後更新：05/19

## 文件目的

本文件說明寶可夢單局 AI 模型的第一版訓練技術、系統架構、實作後遇到的問題，以及第二版訓練核心如何解決穩定性問題。

之後只要調整訓練模式、模型架構、reward、replay buffer、對手課程、保存格式或賽局訓練策略，都必須同步更新本文件的「訓練模式調整文件更新規範」與「變更紀錄」。

## 第一版模型訓練技術

第一版模型以單局對戰為主，不包含賽局層級策略模型。模型負責在單一回合中根據場上狀態選擇出牌、技能或換人行為。

### v1 核心架構

- 模型版本：`battle-tactics-v1`
- 訓練類型：單局強化學習
- 核心演算法：DQN
- 網路架構：單一 `tf.sequential()` Q-network
- 狀態向量長度：`STATE_VECTOR_SIZE = 54`
- 動作輸出數量：`ACTION_VECTOR_SIZE = 8`
- 行動選擇：epsilon-greedy
- 對手課程：
  - 前 50 場對 `RandomAgent`
  - 之後對 `RuleBasedAgent`
- 主要訓練入口：
  - `frontend/src/training/learningAgent.ts`
  - `frontend/src/training/trainingLoop.ts`
  - 早期由 Web Worker 執行，後續改由 Node 後端服務執行

### v1 Reward 設計

Reward 主要來自單局對戰結果與每回合事件：

- 我方造成傷害：正向 reward
- 我方治療或維持戰力：正向 reward
- 擊倒敵方角色：較大正向 reward
- 我方受到傷害：負向 reward
- 我方角色倒下：較大負向 reward
- 單局勝利：終局正向 reward
- 單局失敗：終局負向 reward

### v1 執行架構

早期前端直接啟動訓練流程，後來補上 Web Worker 避免阻塞 UI。但瀏覽器訓練仍受前端生命週期影響，頁面關閉後訓練無法可靠持續。

後續架構改成 Node/TypeScript 本機訓練服務：

- 前端只負責建立模型、監控狀態、開始、暫停、保存、載入與重置
- 後端負責長駐訓練 job
- 前端關閉後，只要後端 PowerShell 視窗仍在，訓練會繼續
- 前端重新開啟後可透過 API 和 SSE 讀回最新狀態

## 第一版遇到的問題

### Q 值高估

v1 使用同一個 DQN 網路同時選擇下一步行動與估計該行動價值。這會讓模型在某些高傷害或偶然成功的動作上過度樂觀，導致 Q 值越估越大。

影響：

- 模型容易誤判單一大傷害行動的價值
- 訓練過程不穩定
- Loss 容易出現異常尖峰

### Loss 爆量

實測中曾出現 loss 飆破 14000 的狀況。主要原因包含：

- Q target 過大
- reward 尺度沒有足夠限制
- 單一 DQN 高估下一步價值
- replay 樣本沒有聚焦高錯誤場次
- 舊模型權重在不穩定訓練後可能已經發散

### Replay Buffer 學習效率不足

v1 的 replay 概念較接近一般隨機複習。隨機抽樣會混入大量容易場次，模型不一定會反覆學到真正錯得離譜的局面。

影響：

- 慘敗局與判斷錯誤局沒有被優先學習
- 勝率曲線可能震盪
- Loss 對少數高錯誤樣本反應劇烈

### 前端生命週期限制

瀏覽器或 Web Worker 訓練時，前端頁面關閉、重新整理或瀏覽器回收資源都可能中斷訓練。這不符合長時間訓練需求。

## 第二版解法

第二版以穩定性優先，升級為 Dueling DDQN + PER 架構，並保留 Node 後端長駐訓練服務。

### v2 核心架構

- 模型版本：`battle-tactics-v2`
- 核心演算法：Dueling Double DQN
- Replay Buffer：Prioritized Experience Replay
- 訓練服務：Node/TypeScript 後端長駐 job manager
- 模型保存：`training_data/models/{modelId}/`
- 前端角色：監控與操作，不直接負責主要訓練

## DDQN：解決 Q 值高估

v2 將模型拆成兩個網路：

- `policyModel`：負責選擇下一步行動
- `targetModel`：負責評估該行動的 Q 值

訓練 target 改成：

1. 使用 `policyModel` 從下一個 state 選出 `nextAction`
2. 使用 `targetModel` 評估該 `nextAction` 的 Q 值
3. 每固定訓練步數同步 target network

目前同步設定：

- `TARGET_SYNC_INTERVAL = 200`

這樣能降低模型自己選、自己評分造成的盲目樂觀。

## PER：優先經驗回放

v2 的 replay buffer 加入 priority 欄位，讓模型更常抽到 TD error 較大的樣本。

目前設計：

- 新樣本初始 priority 使用目前 buffer 最大 priority
- 沒有既有樣本時使用 `1`
- 抽樣依 priority 加權
- 訓練後用 TD error 更新 priority
- 暫不加入 importance-sampling correction，避免第一版 PER 過度複雜

目前參數：

- `PRIORITY_ALPHA = 0.6`
- `PRIORITY_EPSILON = 0.01`

實際 priority 公式：

```text
priority = abs(tdError) + 0.01
```

PER 的目的不是讓 loss 永遠很低，而是讓模型更常學習自己錯得最多的局面，使勝率與決策更穩定。

## Dueling DQN：分離局勢價值與動作優勢

v2 將原本單一路徑 Q-network 改成 functional model，最後輸出拆成：

- `V(s)`：目前局勢本身的價值
- `A(s, a)`：目前局勢下每個行動的相對優勢

最後合成：

```text
Q(s, a) = V(s) + A(s, a) - mean(A)
```

這能讓模型分開學習「現在大局是好是壞」與「這個局面下哪個動作更好」，降低複雜局面下的估值壓力。

## 穩定性保護

v2 仍保留並強化數值保護：

- reward clipping
- Q value clipping
- reported loss clipping
- loss 平滑
- replay buffer 持久化
- target network 定期同步

目前主要參數：

| 參數 | 目前值 | 說明 |
| --- | ---: | --- |
| `STATE_VECTOR_SIZE` | 54 | 單局狀態向量長度 |
| `ACTION_VECTOR_SIZE` | 8 | 模型可輸出的動作數量 |
| `LEARNING_RATE` | 0.0003 | 學習率 |
| `REWARD_CLIP` | 120 | reward 限制 |
| `Q_VALUE_CLIP` | 160 | Q 值限制 |
| `REPORTED_LOSS_CLIP` | 250 | UI 顯示 loss 上限 |
| `REPLAY_BUFFER_LIMIT` | 5000 | replay buffer 最大筆數 |
| `REPLAY_BATCH_SIZE` | 12 | 每次 replay 訓練抽樣數 |
| `REPLAY_TRAINING_WEIGHT` | 0.45 | replay loss 權重 |
| `TARGET_SYNC_INTERVAL` | 200 | target network 同步間隔 |
| `PRIORITY_ALPHA` | 0.6 | PER priority 影響程度 |
| `PRIORITY_EPSILON` | 0.01 | PER priority 最小補值 |
| `gamma` | 0.92 | 折扣因子 |
| `epsilon` | 0.85 | 初始探索率 |
| `minEpsilon` | 0.08 | 最低探索率 |
| `epsilonDecay` | 0.994 | 探索率衰減 |

## 後端訓練服務架構

目前訓練流程如下：

```text
前端訓練頁
  -> REST API 建立、開始、暫停、保存、載入、重置模型
  -> SSE 接收即時訓練狀態
Node/TypeScript 訓練服務
  -> Job Manager 管理每個模型 job
  -> LearningAgent 執行 Dueling DDQN + PER
  -> trainingLoop 執行單局訓練 episode
  -> training_data/models/{modelId}/ 保存 metadata、summary、replay 與權重
```

目前 API：

- `GET /api/training/models`
- `POST /api/training/models`
- `GET /api/training/models/:id`
- `POST /api/training/models/:id/start`
- `POST /api/training/models/:id/pause`
- `POST /api/training/models/:id/reset`
- `POST /api/training/models/:id/save`
- `POST /api/training/models/:id/load`
- `DELETE /api/training/models/:id`
- `GET /api/training/models/:id/events`

## 持久化格式

每個模型會保存到：

```text
training_data/models/{modelId}/
```

主要檔案：

- `metadata.json`：模型名稱、難度、目標、訓練狀態、版本與 replay buffer 摘要
- `summary.json`：列表與監控頁使用的摘要資料
- `latest-replay.json`：最近一場 replay 摘要
- `model.json`：TensorFlow.js 模型拓樸
- `weights.bin`：模型權重

## v1 與 v2 相容性

v2 使用 Dueling DQN functional model，與 v1 sequential model 的權重拓樸不同。

相容性規則：

- v1 metadata 可以被讀取為歷史資料
- v1 權重不強制載入 v2 架構
- 偵測到舊版 v1 權重時，後端會略過不相容權重，避免服務啟動失敗
- 若舊模型曾出現 loss 爆量，建議重置或新建 v2 模型重新訓練

## 訓練速度說明

v2 比原本 v1 慢是正常現象，原因包含：

- DDQN 同時維護 policy network 與 target network
- PER 每次訓練需要計算與更新 priority
- Dueling DQN 網路結構比單一 sequential DQN 複雜
- replay batch 會額外複習過去樣本

目前取向是先讓訓練穩定，再依實測調整速度。

## 賽局訓練預留方向

目前版本只做單局訓練。後續若加入賽局訓練，不建議直接把單局模型改成賽局模型繼續訓練。

建議架構：

- 單局模型：負責回合內出牌、技能與換人決策
- 賽局模型：負責高層策略，例如隊伍輪替、資源保留、風險偏好與整體戰術
- 電腦難度：可由單局模型強度、賽局策略深度、探索率與規則限制共同決定

賽局訓練正式實作前，需先在本文件新增「賽局訓練版本」章節。

## 第三版訓練方向：換卡與換人策略

第三版的重點不是單純讓 loss 更低，而是讓模型學會更完整的單局戰術，包含換卡、換人、保留主力與跨回合建立優勢。

加入換卡或換人後，勝率短期不升反降是合理現象。原因是模型原本主要學習「現在出哪張牌傷害最高」與「是否需要休息」，但新增換人後，模型還必須判斷：

- 現在該不該換
- 要換哪一隻
- 換了當回合會不會被打
- 換完下一回合是否有屬性或速度優勢
- 低血主力是否值得撤退保留
- 不換是否反而能直接擊倒對手

換人策略的回報通常不是當回合立刻出現。模型這回合換人時可能沒有造成傷害，甚至先吃到攻擊，所以短期 reward 可能偏低；但好的換人是為了下一回合對位、保留戰力或避免被擊倒。如果 reward 沒有明確標記這些長期價值，模型可能會學到錯誤結論，例如亂換、該換不換、換到殘血角色，或因為換人當回合少輸出而誤判換人永遠不好。

### v3 後續調整重點

第三版需要補強換人相關 reward 與觀察指標。

建議 reward：

- 換到屬性有利角色：加分
- 低血主力成功撤退：加分
- 換人後下一回合造成有效傷害：加分
- 換到快死角色：扣分
- 換人後立刻被擊倒：扣分
- 無意義連續換人：扣分
- 放棄明顯擊倒機會而換人：扣分

建議觀察指標：

- 每 100 場平均換人次數
- 換人後 1 回合內被擊倒比例
- 換人後 1 回合內造成有效傷害比例
- 低血角色成功撤退次數
- 連續換人次數
- 因換人錯過擊倒機會的次數

第三版訓練時不應只看總勝率。若勝率短期下降，但 loss 穩定、換人錯誤逐漸減少、有效換人率提高，代表模型正在學習新戰術。若勝率長期下降且換人錯誤沒有改善，應優先調整換人 reward，而不是只增加訓練時間。

## 訓練模式調整文件更新規範

之後只要有以下任一變更，都必須更新本文件：

- 新增或移除訓練模式
- 調整 learning rate、epsilon、gamma、batch size 或 target sync
- 調整 reward 設計
- 調整 replay buffer 或 PER 規則
- 調整對手課程或電腦難度
- 調整模型架構
- 調整保存格式或 metadata
- 新增賽局訓練
- 新增模型遷移規則

每次更新請使用以下格式：

```text
MM/DD: 變更標題
- 變更目的：
- 修改項目：
- 影響範圍：
- 新增或調整參數：
- 相容性與遷移注意：
- 驗證方式：
```

## 變更紀錄

### 05/21: 持久化一般模式套用模型狀態

- 變更目的：避免使用者在訓練頁已套用模型後，重新整理或重新進入一般模式時看不到「已套用訓練模型」。
- 修改項目：`LobbyPage` 新增 `pokemon-applied-training-model-v1` localStorage 保存，套用模型時寫入，移除套用時清除，初始化大廳時自動讀回。
- 影響範圍：一般模式 CPU Model 顯示、訓練模型列表「套用中」狀態、模型權重載入流程。
- 新增或調整參數：新增 localStorage key `pokemon-applied-training-model-v1`。
- 相容性與遷移注意：若舊瀏覽器沒有保存狀態，預設仍為未套用模型；使用者重新套用一次後會持久化。
- 驗證方式：執行 `npm.cmd run build`；套用模型後重新整理，再進一般模式應顯示「已套用訓練模型」並載入權重。

### 05/21: 保存改為手動完成模型

- 變更目的：讓尚未達成原目標的長時間訓練模型可由使用者提早結束，並被視為完成模型使用。
- 修改項目：訓練頁原「保存」按鈕改為「完成」；後端沿用 `POST /api/training/models/:id/save`，但語意改為停止訓練、保存權重、寫入 `manuallyCompleted` 與 `completedAt`，並回傳 completed 狀態。
- 影響範圍：`frontend/src/pages/AITrainingPage.tsx`、`frontend/server/trainingServer.ts`、模型 metadata。
- 新增或調整參數：`TrainingModelRecord.manuallyCompleted?: boolean`、`TrainingModelRecord.completedAt?: string`。
- 相容性與遷移注意：舊模型沒有 `manuallyCompleted` 時仍依原本時間或勝率目標判定；reset 會清除手動完成狀態。
- 驗證方式：執行 `npm.cmd run build` 與 `npm.cmd run server:build`；按「完成」後模型應停止訓練、可看曲線圖、可複製續訓與套用到一般模式。

### 05/20: 記錄第三版換卡與換人策略訓練方向

- 變更目的：記錄加入換卡、換人等戰術動作後，勝率短期下降的原因與第三版訓練方向。
- 修改項目：新增「第三版訓練方向：換卡與換人策略」章節，說明動作空間增加、延遲 reward、換人錯誤型態、後續 reward 與觀察指標。
- 影響範圍：訓練設計文件。
- 新增或調整參數：無。
- 相容性與遷移注意：本次只新增文件紀錄，尚未修改訓練程式。
- 驗證方式：確認本文件已包含 v3 章節；後續實作 v3 reward 時需依本章節更新。

### 05/20: 新增完成模型複製續訓

- 變更目的：讓已完成訓練的模型可建立新分支，沿用原本權重與訓練記憶後調整新目標繼續訓練，例如從 65% 勝率模型複製出 80% 目標模型。
- 修改項目：後端新增 `POST /api/training/models/:id/clone`；前端模型列表新增「複製」欄位與複製續訓設定彈窗，確認後會建立新模型並進入訓練頁。
- API 範例：`POST /api/training/models/battle-tactics-1779187170013/clone`，body 可傳 `{ "name": "BattleTacticsAgent 1 80% 目標", "goalMode": "winRate", "targetWinRate": 80, "targetTrainingMinutes": 30, "difficulty": "normal" }`。
- 輸出格式：成功回傳 `201` 與既有 `BackendTrainingPayload` 格式，包含 `model`、`trainingState`、`workerState`、`completed`；未完成來源模型回傳 `409`。
- 規範用法：只允許完成模型複製；複本會保留來源模型的 `trainingState`、`summary`、`epsilon`、`trainingSeconds`、`replayBuffer`、`latest-replay.json`、`model.json`、`weights.bin`，但使用新 `id`、新 `createdAt` 與新訓練目標。
- 相容性與遷移注意：不修改原模型資料；新複本仍使用 `battle-tactics-v2` 保存格式。若新目標尚未達成，訓練頁可按「開始」續訓；新模型不會自動套用到一般模式。
- 驗證方式：執行 `npm.cmd run build` 與 `npm.cmd run server:build`，並手動確認完成模型可複製成 80% 目標分支。

### 05/20: 完成模型進入監控頁不再播放或重啟訓練

- 變更目的：模型完成後重新進入監控頁時，不應播放 replay 造成像是又打一場；後端也不應接受已完成模型的 start 指令再跑一場。
- 修改項目：完成狀態下訓練頁停止 replay 自動播放，戰鬥區顯示「已完成」覆蓋層並虛化背景；後端 `start` 先檢查 completed，完成模型直接回傳 paused/completed 狀態。
- 影響範圍：`frontend/src/pages/AITrainingPage.tsx`、`frontend/server/trainingServer.ts`。
- 新增或調整參數：無。
- 相容性與遷移注意：不影響既有模型 metadata 與權重格式。
- 驗證方式：執行 `npm.cmd run build` 與 `npm.cmd run server:build`。

### 05/20: 修正訓練暫停控制與完成模型入口

- 變更目的：避免按下暫停後，正在收尾的 episode 繼續把結果寫回並排下一輪訓練；同時讓已完成模型仍可從模型選單進入監控頁。
- 修改項目：後端訓練 runtime 新增 `controlVersion`，開始、暫停、重置時更新控制版本；episode 收尾時若版本已失效，會丟棄該輪推進結果並維持正確狀態。前端完成模型按鈕由「已完成」改為「進入」且可點。
- 影響範圍：`frontend/server/trainingServer.ts`、`frontend/src/pages/AITrainingPage.tsx`。
- 新增或調整參數：新增後端 runtime 控制欄位 `controlVersion`。
- 相容性與遷移注意：不影響既有模型 metadata 與權重格式。
- 驗證方式：執行 `npm.cmd run build`。

### 05/19: 建立模型訓練技術文檔

- 變更目的：集中記錄第一版與第二版模型訓練架構，避免後續調整訓練模式時缺少依據。
- 修改項目：新增本文件，整理 v1 DQN、v2 Dueling DDQN + PER、後端訓練服務、持久化與相容性規則。
- 影響範圍：文件與開發流程。
- 新增或調整參數：無。
- 相容性與遷移注意：無程式碼變更。
- 驗證方式：確認文件存在並可由 README 連結。

### 05/19: v2 升級為 Dueling DDQN + PER

- 變更目的：降低 Q 值高估、loss 爆量與 replay 學習效率不足問題。
- 修改項目：新增 policy/target model、target network 同步、priority replay buffer、Dueling Q merge layer。
- 影響範圍：`LearningAgent`、訓練狀態型別、後端保存與載入流程。
- 新增或調整參數：`TARGET_SYNC_INTERVAL`、`PRIORITY_ALPHA`、`PRIORITY_EPSILON`、`REPLAY_BATCH_SIZE`。
- 相容性與遷移注意：v1 權重不相容 v2 Dueling DQN，建議舊模型重置或新建模型。
- 驗證方式：`npm.cmd run build` 與 `npm.cmd run server:build` 通過。

### 05/20: 新增訓練完成後曲線圖報告

- 變更目的：訓練完成後提供可檢視的後端報告，讓使用者能在彈窗中同時查看 Loss / Epsilon 曲線與完整摘要。
- API：`GET /api/training/models/:id/metrics-report`。
- 啟用條件：沿用既有 `completed === true`；未達標模型回傳 `409`，前端按鈕維持停用。
- 輸出格式：JSON 包含 `chartSvg` 與 `summary`。`chartSvg` 是後端即時生成的 SVG；`summary` 包含 episodes、勝率、勝場、敗場、平手、平均回合、loss、epsilon、訓練時間、難度、目標與更新時間。
- 前端呈現：訓練頁 header 顯示「曲線圖」按鈕；完成後點擊會開啟雙欄 modal，左側為 SVG 曲線圖，右側為完整摘要資訊欄。
- 規範：報告即時生成且不另存圖檔；若 `metricHistory` 為空，仍回傳空狀態 SVG 並保留摘要欄。
### 05/20: 修正訓練曲線全程降採樣顯示

- 變更目的：讓訓練完成報告顯示完整訓練過程，而不是只顯示最後 240 筆 episode。
- 實作方式：`metricHistory` 改為最多 720 個全程降採樣點，保留首點、末點與中間 bucket 代表點；資料格式維持 `{ episode, loss, epsilon }`。
- 範例：若模型已訓練 22,458 episodes，SVG X 軸需顯示 `Ep 1` 到 `Ep 22,458`，並標示 `720 sampled points / 22,458 episodes`。
- 規範用法：曲線圖代表全訓練區間的降採樣趨勢；Loss 與 Epsilon 仍共用同一 episode X 軸，Epsilon 使用 0 到 1 的右側語意尺度。
- 輸出格式：`GET /api/training/models/:id/metrics-report` 回傳格式不變，仍為 `{ chartSvg, summary }`；`chartSvg` 內含取樣點數與完整 episode 範圍。
- 相容性：舊模型若曾被截斷為最後 240 筆，無法還原已遺失的早期 episode 點；新訓練資料才會依全程降採樣策略保存。
### 05/20: 一般模式加入電腦後新增難易度選擇

- 變更目的：讓一般模式電腦強度依照訓練頁已套用模型決定，避免房間內手動難度與模型狀態不一致。
- 實作方式：一般模式讀取 `appliedTrainingModel`，有模型時使用模型映射的 `computerDifficulty`；未套用模型時使用 `random` 模式。
- 規範用法：未套用模型時，電腦隨機選角與隨機出招；套用模型後，入門偏隨機，中等沿用既有策略，困難、大師、地獄完整對應訓練模型五段難度並逐步提高選角與技能決策強度。
- 輸出格式：房間只顯示目前模型套用狀態與模型難度，不提供手動難易度切換；一般模式仍維持三局兩勝、選角、載入、先發選擇與戰鬥流程。
### 05/20: 新增完成訓練模型套用對戰難易度

- 變更目的：讓完成訓練的單局戰術模型可直接套用到一般模式的電腦難易度選擇，減少玩家手動對照訓練難度的操作。
- 修改項目：`AITrainingPage` 的模型列表新增最右側套用欄位；`LobbyPage` 提升一般模式電腦難易度狀態，並接收訓練模型套用 payload。
- 影響範圍：`frontend/src/pages/AITrainingPage.tsx`、`frontend/src/pages/LobbyPage.tsx`。
- 範例：完成模型 `BattleTacticsAgent 1` 難度為 `normal` 時，點擊「套用」後一般模式電腦難易度會切到中等，模型列表狀態顯示「套用中」且按鈕變成「移除」。
- 規範用法：只有完成模型可套用；`beginner`、`normal`、`hard`、`master`、`hell` 完整對應入門、中等、困難、大師、地獄五段難度。一般模式不提供手動難易度切換，未套用模型時維持隨機電腦。
- 驗證方式：執行 `npm.cmd run build`，確認訓練列表與一般模式頁型別可通過。
## 05/20: 一般對戰 CPU 主動戰術換牌

- 變更目的：補足單局模型在訓練中較少學到主動換牌的問題，讓一般對戰電腦在低血、無可用攻擊或備戰角色明顯更適合對位時會更換卡牌。
- 修改項目：`frontend/src/pages/LobbyPage.tsx` 新增 `chooseComputerSwitchIndex()`，以目前主戰攻擊收益、玩家主戰威脅、HP 比例與備戰角色速度估算對位分數；本規則目前只在未套用模型、模型未載入或載入失敗時作為 fallback。
- 影響範圍：一般模式 CPU 回合決策；模型權重載入成功時由 `LearningAgent` 優先判斷出招、休息或換牌，戰術換牌不再搶先覆蓋模型決策。
- 規範用法：fallback 狀態下 `random` 與 `beginner` 不主動觸發戰術換牌；`normal`、`hard`、`master`、`hell` 依難度調整換牌門檻，難度越高越願意為更好對位換牌。
- 驗證方式：執行 `npm.cmd run build`，並在一般對戰中讓 CPU 主戰低血或遇到明顯不利對位，確認會走既有「電腦更換為 XXX」換牌動畫。

## 05/20: 複製模型進入監控頁不自動播放回合

- 變更目的：進入模型監控頁不應等同開始訓練；複製模型後未按「開始」時不得播放來源模型最後 replay，也不得讓中止中的 episode 看起來繼續打完一回合。
- 修改項目：複製模型時將 `trainingState.currentReplay` 清空；後端 episode abort 與 `pause` 會清空 `currentReplay`；`AITrainingPage` 只有在 `workerState.training === true` 時才取用 replay 並推進 `eventIndex`。
- 影響範圍：`frontend/server/trainingServer.ts` 的 clone、pause、abort 流程；`frontend/src/training/trainingLoop.ts` 的 aborted reduce；`frontend/src/pages/AITrainingPage.tsx` 的 replay 播放條件。
- 規範用法：模型監控頁的 replay 是訓練中的即時視覺化資料；paused、剛進入、複製後進入都必須維持靜止，不得顯示動作脈衝。
- 驗證方式：執行 `npm.cmd run build` 與 `npm.cmd run server:build`，重啟 8787 訓練服務後確認模型狀態為 `paused` 且前端只在 `workerState.training` 為 true 時播放 replay。

## 05/20: 一般對戰載入完成模型權重

- 變更目的：讓一般模式不只套用模型難度標籤，而是實際使用完成訓練模型的 TensorFlow.js 權重進行電腦行動決策。
- 修改項目：`frontend/server/trainingServer.ts` 新增 `GET /api/training/models/:id/artifacts`，輸出模型 topology、weight specs 與 base64 權重；`frontend/src/pages/LobbyPage.tsx` 在套用模型後建立 `LearningAgent`，以 `importArtifacts()` 載入權重，並在電腦回合用模型從合法動作中選擇技能、休息或更換。
- 影響範圍：一般對戰電腦回合、一般對戰房間 CPU Model 狀態顯示、訓練服務模型讀取 API。
- 規範用法：完成模型必須已有 `training_data/models/{modelId}/model.json` 與 `weights.bin`；載入成功時一般模式顯示「模型權重已載入」，載入失敗時回退既有難度規則。
- 輸出格式：`{ modelId, modelName, difficulty, modelTopology, weightSpecs, weightDataBase64 }`。
- 驗證方式：執行 `npm.cmd run build`、`npm.cmd run server:build`，並以臨時訓練服務呼叫 `GET /api/training/models/battle-tactics-1779187170013/artifacts` 確認回傳 200、topology、12 筆 weight specs 與 base64 權重。
# 05/20: 單局戰術訓練補強換牌與護盾學習

本次調整將一般對戰的單局戰術決策改為「模型優先」。當使用者套用訓練模型且 `model.json`、`weights.bin` 成功載入時，CPU 會直接交給 `LearningAgent` 從合法動作中選擇技能、休息或換牌；只有在未套用模型、模型載入失敗或模型決策例外時，才回退原本的難度規則與手寫保底策略。

訓練端 reward 新增換牌與護盾訊號。換牌會評估換出前血量、換上後有效攻擊提升、承受威脅下降與是否連續反覆換牌；護盾會評估當前血量、敵方預期威脅、是否已開盾，以及下一段對手行動是否真的被護盾減傷。這些 shaping reward 會疊加在既有勝負、傷害、治療、擊倒等 reward 上，不取代原始勝負目標。

訓練場景新增 curriculum episode：低血開局、不利屬性開局、低體力開局、敵方高威脅開局。這些場景會在 episode 初始化時調整 active index、HP 或 SP，讓 LearningAgent 更常遇到必須換牌或開盾才能降低損失的局面。`RuleBasedAgent` 也增加基本換牌與護盾行為，讓學習方能看到並對抗這些策略。

訓練狀態與輸出格式新增：
- `switchCount`：模型 episode 中選擇換牌的次數。
- `beneficialSwitchCount`：換牌後對位改善或低血換出的次數。
- `shieldCount`：模型 episode 中選擇護盾技能的次數。
- `effectiveShieldCount`：護盾實際降低後續傷害或威脅的次數。

訓練頁與 metrics report 會顯示換牌率、有效換牌率、護盾率與有效護盾率。既有模型可繼續訓練，但舊權重不會自動學會新 reward；建議複製既有模型後重新訓練一段時間，再用一般對戰確認 CPU 是否開始在低血、不利對位或高威脅時換牌與開盾。
## 05/21: 新增 v3 規則一致化單局戰術與三局兩勝策略層

- 調整目標：讓訓練環境與一般對戰共用同一套主要戰鬥規則，避免模型在簡化規則中學到無法套用到實戰的行為。
- 模型版本：新增 `battle-tactics-v3-rules`，新版 state/action 維度與 v2 不相容，舊 v2 權重不建議直接續訓。
- Action space：由 8 維擴充為 10 維，包含技能 0-3、休息、普通攻擊、護盾、換牌 0-2。
- 普通攻擊規則：威力 30、命中 100、消耗體力 10、屬性使用目前出戰角色第一屬性，並套用完整傷害與護盾減傷流程。
- 護盾規則：新增雙方都可使用的泛用護盾 action，啟動後不交棒，下一次受到傷害時降低 50%，並納入訓練狀態與合法行動判斷。
- 休息規則：回復 40 體力並交棒。
- 換牌規則：只能換上存活備戰角色，會處理再生特性、清除正面 buff，換牌後交棒。
- State vector：擴充為 96 維，加入血量、體力、出戰/存活、護盾、睡眠/麻痺、攻防速 buff/debuff、技能類型、技能消耗、屬性倍率、預估傷害、普攻可用性、休息收益與回合進度。
- Reward shaping：採均衡戰術，不讓換牌、休息、普攻、護盾的誘因蓋過勝負獎懲。
  - 換牌：低血撤退、換上後 matchup 改善加分；滿血亂換、連續換牌扣分。
  - 休息：低體力且缺少有效攻擊時加分；高體力、可擊殺卻休息、連續休息扣分。
  - 普攻：低體力時穩定補刀或收尾加分；明明技能可擊殺卻普攻扣分。
  - 護盾：低血或面臨高威脅時加分；重複開盾、低威脅空盾、連續護盾扣分。
- 訓練統計：新增 `basicAttackCount`、`restCount`，並預留三局兩勝統計欄位 `matchWinCount`、`matchLossCount`、`matchDrawCount`、`comebackWinCount`、`leadPickWinCount`。
- 三局兩勝策略層：新增 `MatchStrategyPolicy` 架構，先以規則化策略輸出 aggressive / balanced / defensive 與 action bias；底層行動仍交給單局戰術模型。後續若要訓練賽局模型，可沿用此介面收集 match-level 資料。
- 一般模式套用：套用訓練模型後，電腦現在可執行新版 action，包括普通攻擊與泛用護盾，不再只支援技能、休息、換牌。
- 驗證：`npm.cmd run build` 通過；`npm.cmd run server:build` 在外部權限下通過，沙盒內 esbuild 讀取目錄曾回報 Access is denied。
## 05/21: 新增主頁屬性克制查詢面板

- 新增目的：主頁新增「屬性表」入口，讓玩家不用進入對戰或圖鑑也能選擇屬性並查看克制關係。
- 資料來源：沿用 `frontend/src/data/type_chart.json`、`pokemonTypeFilterOptions`、`getTypeLabel()` 與 `getTypeChipClass()`，不新增第二份屬性倍率資料。
- 規範用法：選定屬性視為攻擊屬性；「超級克制」列出對雙屬性防守組合倍率 `>= x4` 的組合，「克制」列出對單一防守屬性倍率 `> x1` 的屬性，「被剋」列出選定屬性作為防守屬性時會被哪些攻擊屬性打出 `> x1`。
- 輸出格式：每筆結果以屬性色票與倍率呈現，例如 `草 / 冰 x4`、`水 x2`；分類沒有結果時顯示 `無`。
- 驗證方式：執行 `npm.cmd run build`，並手動確認主頁「屬性表」面板選擇 Fire 與 Electric 時的克制結果符合屬性表。
- 05/21 補充：屬性表改為攻擊端可選 1 到 2 個屬性，下方直接顯示防守端結果；「超級克制」與「克制」會列出最佳攻擊屬性打到的防守單/雙屬性，「被剋」則把目前選取的攻擊端屬性視為自身雙屬性防守組合，列出會打出 `> x1` 的攻擊屬性。

## 05/21: 修正換牌率與護盾率顯示分母

- 新增目的：避免「換牌率」與「護盾率」以累積次數除以 episode 數，造成一場內多次換牌或開盾時顯示超過 100%。
- 規範用法：訓練頁 UI 顯示換牌率與護盾率時，分母改用 `episodes * averageTurns / 2` 估算 LearningAgent 的行動機會；有效換牌率仍為 `beneficialSwitchCount / switchCount`，有效護盾率仍為 `effectiveShieldCount / shieldCount`。
- 範例：若 100 場、平均 20 回合、換牌 120 次，換牌率顯示為 `120 / (100 * 20 / 2) = 12.0%`，不再顯示為 `120.0%`。
- 輸出格式：`AITrainingPage` 的即時訓練卡片、模型資訊面板與 metrics report 摘要皆顯示一位小數百分比，例如 `12.0%`。
- 相容性：既有模型不需重練；舊 summary 只要有 `episodes` 與 `averageTurns` 即可用新分母回推顯示。

## 05/21: 新增最近 N 場勝率與白底 Metrics Report

- 修改項目：`TrainingState` 新增 `recentResults`，每場訓練結束後保存 `win`、`loss`、`draw`，最多保留最近 1000 筆；`metricHistory` 追加 `recentWinRate100` 與 `recentWinRate500`。
- 影響範圍：`frontend/src/types/battle.ts`、`frontend/src/training/trainingLoop.ts`、`frontend/server/trainingServer.ts`、`frontend/src/pages/AITrainingPage.tsx`。
- 新增或調整參數：最近勝率視窗固定為 100、500、1000 場；保存上限為 `MAX_RECENT_RESULT_POINTS = 1000`。
- API 輸出格式：`summary.json` 與 `GET /api/training/models/:id/metrics-report` 的 `summary` 新增 `recentResultCount`、`recentWinRate100`、`recentWinRate500`、`recentWinRate1000`。
- 規範用法：若 `recentResultCount` 為 0，UI 顯示 `--`，避免舊模型被誤判為最近勝率 0%；舊模型需繼續訓練或複製後續訓練才會累積最近 N 場資料。
- 報告圖規範：`chartSvg` 仍由後端即時生成，不另存檔；輸出改為白底 SVG，保留 Loss 與 Epsilon，若 metric 點含最近勝率則加上 Recent 100 Win Rate 綠色曲線。
- 驗證方式：執行 `npm.cmd run build` 與 `npm.cmd run server:build`，確認前端與後端訓練服務均可編譯。

## 05/22: 將主監控近期勝率改為近 500 場

- 修改項目：模型列表與訓練中統計卡的近期勝率主指標由 `recentWinRate100` 改為 `recentWinRate500`。
- 規範用法：訓練判讀以近 500 場作為主監控視窗，近 100 場僅作為短期波動參考，近 1000 場作為長期穩定性參考。
- 輸出格式：`GET /api/training/models/:id/metrics-report` 的 `chartSvg` 綠色曲線改為 Recent 500 Win Rate；`summary` 仍保留 `recentWinRate100`、`recentWinRate500`、`recentWinRate1000`。

## 05/23: 加強 v3.1 訓練突破平台期

- 修改項目：`LearningAgent` 最低探索率由 `0.08` 降為 `0.02`，降低長訓練後仍持續隨機動作造成的勝率上限損耗。
- 修改項目：模型 exploitation 選招加入戰術先驗分數，依擊殺、屬性剋制、治療缺口、護盾威脅、休息體力與換牌對位改善微調 Q 值排序。
- 修改項目：`trainingLoop` 的 reward shaping 補強攻擊、治療、無效 setup 與終局血量差，讓模型更重視收頭、保血與高品質勝局。
- 規範用法：這層戰術先驗只作為 Q 值排序輔助，不取代模型；既有 v3 權重可繼續載入訓練，後續 episode 會逐步套用新的探索率與 reward。
- 輸出格式：主畫面仍以近 500 場勝率作為主要判讀指標；若加強有效，應先看到 `recentWinRate500` 往上，再看總勝率緩慢追上。
