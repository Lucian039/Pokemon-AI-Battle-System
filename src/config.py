"""
寶可夢圖片相似度辨識系統設定檔。

此專案不訓練分類模型，而是使用預訓練 CNN 做特徵提取，再以 cosine similarity
比對使用者圖片與 reference database。
"""

from pathlib import Path

import torch


# 專案與工作區路徑
BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_DIR = BASE_DIR.parent

# 使用者要求的集中設定
RAW_IMAGE_DIR = "pokemon_jpg"
REFERENCE_DIR = "dataset/reference"
OUTPUT_DIR = "outputs"
FEATURE_PATH = "outputs/pokemon_features.npy"
INDEX_PATH = "outputs/pokemon_index.json"
IMAGE_SIZE = 224
MODEL_NAME = "efficientnet_b0"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"]
SIMILARITY_THRESHOLD = 0.60
TOP_K = 5

# 解析後的實際 Path，讓 Windows 與跨工作目錄執行都能正常使用
RAW_IMAGE_PATH = WORKSPACE_DIR / RAW_IMAGE_DIR
REFERENCE_PATH = BASE_DIR / REFERENCE_DIR
OUTPUT_PATH = BASE_DIR / OUTPUT_DIR
FEATURE_FILE_PATH = BASE_DIR / FEATURE_PATH
INDEX_FILE_PATH = BASE_DIR / INDEX_PATH
