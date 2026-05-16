"""
建立寶可夢 reference feature database。

執行方式：
    python src/build_feature_database.py
"""

import numpy as np
from tqdm import tqdm

from config import FEATURE_FILE_PATH, INDEX_FILE_PATH, OUTPUT_PATH, REFERENCE_PATH, SUPPORTED_EXTENSIONS
from feature_extractor import FeatureExtractor
from image_utils import load_image, preprocess_image
from utils import clean_pokemon_name, ensure_dir, get_image_files, save_json


def main() -> None:
    """掃描 reference 圖片並建立 feature database。"""
    if not REFERENCE_PATH.exists():
        raise FileNotFoundError(f"找不到 reference 資料夾：{REFERENCE_PATH}")

    ensure_dir(OUTPUT_PATH)

    image_files = get_image_files(REFERENCE_PATH, SUPPORTED_EXTENSIONS)
    if not image_files:
        raise FileNotFoundError(f"reference 資料夾內沒有支援格式圖片：{REFERENCE_PATH}")

    extractor = FeatureExtractor()
    features = []
    index_data = []
    skipped_count = 0

    for image_path in tqdm(image_files, desc="Building feature database"):
        try:
            image = load_image(image_path)
            image_tensor = preprocess_image(image)
            feature = extractor.extract(image_tensor)[0]
        except Exception as exc:
            skipped_count += 1
            print(f"Warning: 跳過圖片 {image_path.name}，原因：{exc}")
            continue

        current_index = len(features)
        features.append(feature)
        index_data.append(
            {
                "index": current_index,
                "name": clean_pokemon_name(image_path.name),
                "filename": image_path.name,
                "path": str(image_path.relative_to(REFERENCE_PATH.parent.parent)),
            }
        )

    if not features:
        raise RuntimeError("沒有任何圖片成功建立 feature，請檢查 reference 圖片內容。")

    feature_matrix = np.vstack(features).astype(np.float32)
    np.save(FEATURE_FILE_PATH, feature_matrix)
    save_json(index_data, INDEX_FILE_PATH)

    print(f"成功處理圖片數量：{len(features)}")
    print(f"跳過圖片數量：{skipped_count}")
    print(f"Feature vector 維度：{feature_matrix.shape[1]}")
    print(f"Feature output：{FEATURE_FILE_PATH}")
    print(f"Index output：{INDEX_FILE_PATH}")


if __name__ == "__main__":
    main()
