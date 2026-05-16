"""
將原始 pokemon_jpg 圖片複製到 dataset/reference。

此腳本不移動、不刪除原始圖片；若目標檔案已存在，預設跳過。
執行方式：
    python src/prepare_reference_images.py
"""

import shutil

from config import RAW_IMAGE_PATH, REFERENCE_PATH, SUPPORTED_EXTENSIONS
from utils import ensure_dir, get_image_files


def main() -> None:
    """複製支援格式圖片到 reference 資料夾。"""
    if not RAW_IMAGE_PATH.exists():
        raise FileNotFoundError(f"找不到原始圖片資料夾：{RAW_IMAGE_PATH}")

    ensure_dir(REFERENCE_PATH)

    copied_count = 0
    skipped_count = 0
    image_files = get_image_files(RAW_IMAGE_PATH, SUPPORTED_EXTENSIONS)

    for source_path in image_files:
        target_path = REFERENCE_PATH / source_path.name
        if target_path.exists():
            skipped_count += 1
            continue

        shutil.copy2(source_path, target_path)
        copied_count += 1

    print(f"成功複製圖片數量：{copied_count}")
    print(f"跳過既有圖片數量：{skipped_count}")
    print(f"Reference directory：{REFERENCE_PATH}")


if __name__ == "__main__":
    main()
