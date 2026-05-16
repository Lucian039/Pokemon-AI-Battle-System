"""
圖片讀取與前處理工具。

所有輸入圖片都會轉成 RGB、縮放到 224x224，並套用 ImageNet normalize。
"""

from pathlib import Path

import torch
from PIL import Image, UnidentifiedImageError
from torchvision import transforms

from config import IMAGE_SIZE


def load_image(image_path: Path) -> Image.Image:
    """讀取圖片並轉成 RGB。"""
    try:
        with Image.open(image_path) as image:
            return image.convert("RGB")
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"圖片不存在：{image_path}") from exc
    except UnidentifiedImageError as exc:
        raise ValueError(f"圖片讀取失敗或格式不支援：{image_path}") from exc
    except OSError as exc:
        raise ValueError(f"圖片讀取失敗：{image_path}") from exc


def preprocess_image(image: Image.Image) -> torch.Tensor:
    """將 PIL Image 轉換成模型可用的 PyTorch tensor。"""
    transform = transforms.Compose(
        [
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    return transform(image)
