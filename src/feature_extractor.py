"""
CNN 特徵提取器。

預設使用 EfficientNet-B0 ImageNet 預訓練權重，移除分類層後輸出 normalized feature vector。
"""

from typing import Callable

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models

from config import DEVICE, MODEL_NAME


class FeatureExtractor:
    """預訓練 CNN feature extractor。"""

    def __init__(self, model_name: str = MODEL_NAME, device: str = DEVICE) -> None:
        self.model_name = model_name
        self.device = torch.device(device)
        self.model, self.forward_features = self._build_model(model_name)
        self.model.to(self.device)
        self.model.eval()

    def _build_model(self, model_name: str) -> tuple[nn.Module, Callable[[torch.Tensor], torch.Tensor]]:
        """依模型名稱建立 backbone，方便未來切換模型。"""
        if model_name == "efficientnet_b0":
            weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1
            model = models.efficientnet_b0(weights=weights)

            def forward_features(x: torch.Tensor) -> torch.Tensor:
                x = model.features(x)
                x = model.avgpool(x)
                return torch.flatten(x, 1)

            return model, forward_features

        if model_name == "resnet50":
            weights = models.ResNet50_Weights.IMAGENET1K_V2
            model = models.resnet50(weights=weights)
            backbone = nn.Sequential(*list(model.children())[:-1])

            def forward_features(x: torch.Tensor) -> torch.Tensor:
                x = backbone(x)
                return torch.flatten(x, 1)

            return backbone, forward_features

        if model_name == "mobilenet_v2":
            weights = models.MobileNet_V2_Weights.IMAGENET1K_V1
            model = models.mobilenet_v2(weights=weights)

            def forward_features(x: torch.Tensor) -> torch.Tensor:
                x = model.features(x)
                x = F.adaptive_avg_pool2d(x, (1, 1))
                return torch.flatten(x, 1)

            return model, forward_features

        raise ValueError(f"不支援的模型名稱：{model_name}")

    @torch.no_grad()
    def extract(self, image_tensor: torch.Tensor) -> np.ndarray:
        """提取單張或 batch 圖片的 L2 normalized feature vector。"""
        if image_tensor.dim() == 3:
            image_tensor = image_tensor.unsqueeze(0)

        image_tensor = image_tensor.to(self.device)
        features = self.forward_features(image_tensor)
        features = F.normalize(features, p=2, dim=1)
        return features.cpu().numpy().astype(np.float32)
