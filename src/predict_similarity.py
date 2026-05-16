"""
單張圖片相似度推論。

執行方式：
    python src/predict_similarity.py --image path/to/test_image.png
"""

import argparse
from pathlib import Path

import numpy as np

from config import FEATURE_FILE_PATH, INDEX_FILE_PATH, SIMILARITY_THRESHOLD, SUPPORTED_EXTENSIONS, TOP_K
from feature_extractor import FeatureExtractor
from image_utils import load_image, preprocess_image
from utils import cosine_similarity, load_json


def parse_args() -> argparse.Namespace:
    """解析命令列參數。"""
    parser = argparse.ArgumentParser(description="寶可夢圖片相似度辨識")
    parser.add_argument("--image", type=Path, required=True, help="要辨識的單張圖片路徑")
    return parser.parse_args()


def validate_inputs(image_path: Path) -> None:
    """檢查輸入圖片與 feature database 是否存在。"""
    if not image_path.exists():
        raise FileNotFoundError(f"圖片不存在：{image_path}")
    if image_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"不支援的圖片格式：{image_path.suffix}")
    if not FEATURE_FILE_PATH.exists() or not INDEX_FILE_PATH.exists():
        raise FileNotFoundError(
            "Feature database 尚未建立，請先執行：python src/build_feature_database.py"
        )


def main() -> None:
    """推論入口。"""
    args = parse_args()
    validate_inputs(args.image)

    feature_matrix = np.load(FEATURE_FILE_PATH).astype(np.float32)
    index_data = load_json(INDEX_FILE_PATH)

    if len(feature_matrix) != len(index_data):
        raise ValueError("feature matrix 與 pokemon_index.json 數量不一致，請重新建立 database。")

    image = load_image(args.image)
    image_tensor = preprocess_image(image)

    extractor = FeatureExtractor()
    query_feature = extractor.extract(image_tensor)[0]
    similarities = cosine_similarity(query_feature, feature_matrix)

    top_k = min(TOP_K, len(similarities))
    top_indices = np.argsort(similarities)[::-1][:top_k]

    print("Prediction Result:")
    if similarities[top_indices[0]] < SIMILARITY_THRESHOLD:
        print("無法可靠辨識，請上傳更清楚的寶可夢圖片")

    for rank, index in enumerate(top_indices, start=1):
        pokemon = index_data[int(index)]
        similarity_percent = float(similarities[index]) * 100
        print(f"{rank}. {pokemon['name']} - {similarity_percent:.2f}% similarity")


if __name__ == "__main__":
    main()
