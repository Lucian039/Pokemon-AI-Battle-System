# Pokemon-AI-Battle-System

## 專案簡介

Pokemon-AI-Battle-System 是一套寶可夢圖片相似度辨識與前端對戰展示系統。後端以 Python、PyTorch、TorchVision 使用預訓練 CNN 進行圖片特徵提取，再透過 cosine similarity 比對使用者圖片與 reference database；前端以 React、Vite、TypeScript、Tailwind CSS、Framer Motion 與 lucide-react 建置寶可夢對戰介面。

目前圖片辨識流程不訓練分類模型，而是將 reference 圖片轉成 feature vector 後建立資料庫。推論時會提取輸入圖片的 feature vector，與 reference database 進行相似度比對並輸出 Top 5 結果。

## 核心功能

- 將原始寶可夢圖片整理到 `dataset/reference/`。
- 使用 EfficientNet-B0 ImageNet 預訓練權重提取圖片特徵。
- 建立 `outputs/pokemon_features.npy` 與 `outputs/pokemon_index.json`。
- 對單張圖片輸出 Top 5 相似寶可夢與相似度百分比。
- 提供 React + Vite 前端大廳、選角、載入與對戰介面。
- 前端目前使用 mock data 與本地資料檔，尚未串接後端 API。

## 辨識流程

1. 使用 EfficientNet-B0 ImageNet 預訓練模型提取圖片 feature vector。
2. 對 feature vector 做 L2 normalize。
3. 掃描 `dataset/reference/` 並建立 reference feature database。
4. 對使用者輸入圖片提取 feature。
5. 使用 cosine similarity 輸出 Top 5 最相似的 reference 寶可夢。

## 專案結構

```text
Pokemon-AI-Battle-System/
├── dataset/
│   └── reference/
├── outputs/
│   ├── pokemon_features.npy
│   └── pokemon_index.json
├── src/
│   ├── prepare_reference_images.py
│   ├── build_feature_database.py
│   ├── predict_similarity.py
│   ├── feature_extractor.py
│   ├── image_utils.py
│   ├── config.py
│   └── utils.py
├── test_images/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── data/
│   │   ├── pages/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── package.json
│   ├── tailwind.config.ts
│   └── vite.config.ts
├── requirements.txt
└── README.md
```

## 準備環境

建立 Python 虛擬環境並安裝依賴：

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

PowerShell 若無法啟用虛擬環境，可先在目前程序放寬執行政策：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.venv\Scripts\Activate.ps1
```

若要使用 GPU，請依 CUDA 版本安裝相容的 PyTorch。

## 準備 Reference 圖片

原始圖片預期放在專案同層的 `pokemon_jpg/`。執行下列指令會將支援格式圖片複製到 `dataset/reference/`，不會移動或刪除原始圖片：

```bash
python src/prepare_reference_images.py
```

支援格式：

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`

檔名若為 `Pikachu.png`，索引名稱會推測為 `Pikachu`；若為 `25.jpg`，會依 National Dex 編號推測為 `Pikachu`。

## 建立 Feature Database

準備好 reference 圖片後執行：

```bash
python src/build_feature_database.py
```

輸出檔案：

```text
outputs/pokemon_features.npy
outputs/pokemon_index.json
```

若 `dataset/reference/` 圖片有新增、刪除或替換，請重新執行此指令更新 feature database。

## 單張圖片推論

```bash
python src/predict_similarity.py --image path/to/test_image.png
```

輸出範例：

```text
Prediction Result:
1. Pikachu - 92.35% similarity
2. Raichu - 81.42% similarity
3. Pichu - 78.11% similarity
4. Jolteon - 63.54% similarity
5. Eevee - 59.20% similarity
```

若 Top 1 similarity 低於 `SIMILARITY_THRESHOLD = 0.60`，會提示：

```text
無法可靠辨識，請上傳更清楚的寶可夢圖片
```

## 前端介面

前端位於：

```text
frontend/
```

安裝與啟動：

```powershell
cd frontend
npm install
npm run dev
```

預設開發伺服器：

```text
http://127.0.0.1:5173
```

也可從專案根目錄執行：

```text
start_ui.bat
```

前端目前使用 mock data 與本地資料，主要資料來源包含：

- `frontend/src/data/pokedexMock.ts`
- `frontend/src/data/pokemon_stats.json`
- `frontend/src/data/skills.json`
- `frontend/src/data/type_chart.json`
- `frontend/src/utils/battleCalculator.ts`

## 模型設定

目前預設使用 TorchVision 的 `efficientnet_b0`。模型設定集中在：

```text
src/config.py
```

主要設定：

- `MODEL_NAME = "efficientnet_b0"`
- `IMAGE_SIZE = 224`
- `SIMILARITY_THRESHOLD = 0.60`
- `TOP_K = 5`

若要改用其他模型，需同步確認 `src/feature_extractor.py` 支援該模型輸出。

## 戰鬥資料與前端規格

前端對戰資料使用本地 JSON 與 TypeScript 工具函式。寶可夢戰鬥資料包含名稱、屬性、HP、攻擊、防禦、速度與技能等欄位。技能與屬性倍率由 `skills.json`、`type_chart.json` 與 `battleCalculator.ts` 組合計算。

### 戰鬥前載入畫面

一般模式載入頁需在畫面中上方顯示「一般模式」標題，英文輔助文字為 `Normal Battle`。玩家與敵方隊伍卡牌需分別放置在畫面左側中央與右側中央，使用垂直置中定位並保留響應式縮放，避免中等寬度螢幕與中央 VS 區塊重疊。相關實作位於 `frontend/src/pages/BattleLoadingPage.tsx` 的 `TeamFan` 定位與頁面標題區塊。

### BattlePage 對戰介面固定版面

對戰畫面採 `100vh` 且 `overflow-hidden`，Header 固定 `64px`。主內容分為上方 60% Battle Area 與下方 40% Action Area。

Battle Area 使用三欄配置 `360px minmax(0,1fr) 360px`，左側固定顯示我方出戰卡牌，中間顯示 TURN TIMER、VS、目前回合與最新狀態，右側固定顯示敵方出戰卡牌。

Action Area 使用 `260px minmax(0,1fr) 260px`，左側為我方備選，中間為 BattleLog、四個動態技能、護盾與更換卡片，右側為敵方備選。左右備選固定寬度且中間操作區保留 `min-w-0`，避免技能按鈕被擠壓。出戰卡牌圖片統一使用 `object-contain`，HP bar 依血量大於 50%、30% 至 50%、低於 30% 分別顯示青綠、黃色、紅色。

### Draft Selection 選角區

候選池顯示 20 隻 `battle-enabled` 且具備戰鬥數據的角色。中間角色卡使用正方形 `aspect-square`，卡片內保留圖片、名稱、編號、屬性與基礎數值。候選列表維持 `overflow-y-auto` 與 `overscroll-contain`，可用滾輪瀏覽完整 20 隻角色，不影響左右陣容欄與既有輪抽邏輯。

## 常用指令

```bash
python src/prepare_reference_images.py
python src/build_feature_database.py
python src/predict_similarity.py --image path/to/test_image.png
```

```powershell
cd frontend
npm run dev
npm run build
```

## 更新紀錄

05/17: 新增 Git 版本控制忽略規則。新增 `.gitignore`，排除 Python 虛擬環境、快取、`frontend/node_modules/`、`frontend/dist/`、本地 feature database 輸出與系統暫存檔，避免推送依賴與產物到遠端倉庫。
05/17: 調整 Draft Selection 外層版面。選角頁改用無外框頁面容器，移除最外層玻璃卡片與圓角框，使陣營色渲染可覆蓋整個畫面；同時將頁首「一般模式」放大並上移。
05/17: 修正 BattleLoadingPage 中上標題置中。載入頁「Normal Battle / 一般模式」改用全寬置中容器，並降低英文 tracking，避免字距造成視覺中心偏移。
05/17: 改善 Draft Selection 陣營色背景下的左右陣容可讀性。降低藍/紅漸層渲染透明度，並將左右陣容欄改為更深、更不透明的面板背景與較高對比的等待文字，避免陣營色壓低已選欄位辨識度。
05/17: 擴大 Draft Selection 陣營色渲染起點。陣營色漸層層改為固定覆蓋整個視窗寬度，玩家挑選時從畫面最左方開始渲染藍色，敵方挑選時從畫面最右方開始渲染紅色。
05/17: 調整 Draft Selection 中間選擇區陣營色方向。玩家挑選時中間候選區由左側向右渲染 `#0000CE` 藍色漸層，敵方挑選時由右側向左渲染 `#CE0000` 紅色漸層，保留候選卡與選角流程不變。
05/17: 調整 Draft Selection 陣營色渲染範圍。移除整頁背景漸層，改為只在中間候選角色選擇區周圍渲染陣營色光暈；玩家挑選時使用 `#0000CE` 藍色渲染，敵方挑選時使用 `#CE0000` 紅色渲染，候選卡維持在渲染層上方。
05/17: 調整 Draft Selection 背景渲染為全畫面陣營色。玩家選角時整個選角畫面套用 `#0000CE` 藍色 radial gradient，敵方選角時整個選角畫面套用 `#CE0000` 紅色 radial gradient，不再使用半邊背景。
05/17: 強化 Draft Selection 半頁背景渲染。將原本不明顯的模糊光暈改為覆蓋整個選角內容區的線性半頁背景；玩家選角時左半部明確渲染 `#0000CE`，敵方選角時右半部明確渲染 `#CE0000`，並將候選內容層提高以確保卡片顯示在背景上方。
05/17: 調整 Draft Selection 頁面半區背景渲染。玩家選角階段改為頁面左半部使用 `#0000CE` 藍色漸層光暈，敵方選角階段改為頁面右半部使用 `#CE0000` 紅色漸層光暈；上方提示文字區本身不再加背景卡。
05/17: 調整 Draft Selection 輪抽提示與 CPU 選角時機。移除畫面左側 `Draft Round`、目前輪到與選角訊息文字；CPU 選角時在倒數 58 秒先顯示暫選角色，倒數 56 秒才正式鎖定加入敵方陣容。
05/17: 新增 Draft Selection 選滿隊伍後的準備戰鬥流程。雙方 3v3 角色都選完後，上方提示改為「準備戰鬥」並顯示 10 秒倒數；準備倒數期間停用底部鎖定按鈕並停止原選角倒數。倒數歸零後再等待 2 秒，自動進入戰鬥載入頁面。
05/17: 調整 Draft Selection 敵方選角倒數規則。敵方選擇時同樣顯示 60 秒倒數，畫面維持「對手正在選擇夥伴」，倒數持續遞減並在約 55 秒時完成 CPU 選角，不再使用 3 秒短倒數。
05/17: 調整 Draft Selection 敵方選角節奏。玩家鎖定角色後不再立即產生 CPU 選角結果，改為進入「對手正在選擇夥伴」狀態並顯示 3 秒倒數；倒數期間暫停玩家 60 秒選角倒數並停用鎖定操作，3 秒後才將 CPU 選擇加入敵方陣容並恢復玩家選角。
05/17: 修正 Draft Selection 提示文字對齊方式。將「請選擇你的夥伴」與倒數秒數從頁首區移入 `DRAFT ROUND` 同一列的中間欄位，直接與左側輪抽資訊同列對齊，避免透過頁首高度推動造成視覺位置不變。
05/17: 對齊 Draft Selection 頁首提示與左側輪抽資訊列。頁首提示區改為較高容器並靠底部對齊，使「請選擇你的夥伴」與秒數位置接近左側 `DRAFT ROUND` 資訊文字的水平高度。
05/17: 微調 Draft Selection 頁首提示位置。將頁首提示區高度與上方內距略微增加，使「請選擇你的夥伴」與倒數秒數整體往下移動，其他候選清單與左右陣容不變。
05/17: 調整 Draft Selection 上方提示文案。移除上方 `1v1 隨機輪抽` 標題；玩家選擇階段顯示「請選擇你的夥伴」，敵方選擇階段顯示「對手正在選擇夥伴」，下方以純數字顯示倒數秒數且不加 `s`。移除中間資訊列右側 Timer 區塊，底部操作按鈕文案固定為「鎖定」。
05/17: 調整 Draft Selection 中間候選清單垂直位置與捲軸顯示。候選清單在中間可用區域內改為靠下對齊，貼近「請選擇角色」按鈕上方；新增 `no-scrollbar` 工具樣式隱藏可視捲軸，但保留 `overflow-y-auto` 滑動瀏覽功能。
05/17: 調整 Draft Selection 中間候選清單為固定欄寬置中排列。候選卡維持既有尺寸，不再透過壓縮容器縮小圖片；中間 grid 改為 4 至 5 欄固定欄寬並以 `w-fit mx-auto` 置中，使候選卡整組向中間靠攏。滾動區高度限制為約三排候選卡，超出內容由中間清單捲動瀏覽。
05/17: 修正 Draft Selection 中間候選清單靠攏方式。移除會壓縮整組候選清單的固定最大寬度，保留候選卡原尺寸，只透過較小欄距與列距讓卡片彼此靠攏。
05/17: 調整 Draft Selection 中間候選清單對齊。候選清單加入最大寬度並置中，搭配中間區左右內距，讓候選卡彼此靠攏且整組遠離左右陣容欄。
05/17: 收緊 Draft Selection 中間候選清單間距。縮小候選格欄距、列距與圖片框到名稱之間的距離，維持圖片尺寸與 4 至 5 欄排列不變，使中間選擇區更緊湊。
05/17: 縮小 Draft Selection 中間候選卡比例。候選列表維持 4 至 5 欄排列，但每個候選項目加入固定最大寬度並置中，使正方形圖片框、角色圖片與名稱等比例縮小，避免中間選擇區圖片過大造成視覺擁擠。
05/17: 微調 Draft Selection 中間候選卡。候選按鈕本體改為透明容器，不再用外框包住名稱；僅正方形圖片區保留框線、背景、hover 與目前選取狀態，角色名稱固定顯示在圖片框下方。中間可捲動候選列表增加垂直間距與右側捲軸保留空間，避免候選內容與滾輪區互相擠壓。
05/17: 調整 Draft Selection 中間選角區顯示規格。中間候選區移除外層卡片框線與背景，只保留標題資訊與可捲動候選列表；候選角色的圖片區維持正方形 `aspect-square`，圖片使用 `object-contain` 與置中顯示，避免裁切角色；卡片內容僅在圖片下方顯示角色名稱，不再顯示編號、屬性、HP、攻擊、防禦、速度或其他數值。
05/17: 修正 README 亂碼並重建繁體中文專案文件。內容包含專案簡介、環境安裝、reference 圖片準備、feature database 建立、單張圖片推論、前端啟動方式、模型設定、BattlePage 固定版面規格、戰鬥前載入畫面規格與 Draft Selection 選角區規格；僅更新文件，不改動程式邏輯、指令流程或 UI。
05/17: 新增戰鬥前載入畫面版面規範。一般模式載入頁需在畫面中上方顯示「一般模式」標題，英文輔助文字為 `Normal Battle`；玩家與敵方隊伍卡牌不可固定於左上與右下角，需分別放置在畫面左側中央與右側中央，使用垂直置中定位並保留響應式縮放，避免中等寬度螢幕與中央 VS 區塊重疊。相關實作位於 `frontend/src/pages/BattleLoadingPage.tsx` 的 `TeamFan` 定位與頁面標題區塊。
05/17: 新增 BattlePage 對戰介面固定版面規格。對戰畫面採 100vh 且 overflow-hidden，Header 固定 64px；主內容分為上方 60% Battle Area 與下方 40% Action Area。Battle Area 使用三欄配置 `360px minmax(0,1fr) 360px`，左側固定顯示我方出戰卡牌，中間顯示 TURN TIMER、VS、目前回合與最新狀態，右側固定顯示敵方出戰卡牌。Action Area 使用 `260px minmax(0,1fr) 260px`，左側為我方備選，中間為 BattleLog、四個動態技能、護盾與更換卡片，右側為敵方備選；左右備選固定寬度且中間操作區保留 `min-w-0`，避免技能按鈕被擠壓。出戰卡牌圖片統一使用 object-contain，HP bar 依血量大於 50%、30% 至 50%、低於 30% 分別顯示青綠、黃色、紅色。
05/17: 調整 Draft Selection 中間選角區。候選池改為顯示 20 隻 battle-enabled 且具備戰鬥數據的角色；中間角色卡使用正方形 `aspect-square`，卡片內保留圖片、名稱、編號、屬性與基礎數值。候選列表維持 `overflow-y-auto` 與 `overscroll-contain`，可用滾輪瀏覽完整 20 隻角色，不影響左右陣容欄與既有輪抽邏輯。
