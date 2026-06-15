# backend/app/core/face_embedder.py

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models, transforms
import numpy as np
import cv2
from PIL import Image
from app.config import settings


# ── Định nghĩa lại FaceNet (giống hệt notebook training) ──
class FaceNet(nn.Module):
    def __init__(self, embedding_size: int = 512):
        super().__init__()
        backbone = models.resnet50(weights=None)
        self.features = nn.Sequential(*list(backbone.children())[:-1])
        self.fc = nn.Linear(2048, embedding_size)
        self.bn = nn.BatchNorm1d(embedding_size)

    def forward(self, x):
        x = self.features(x)
        x = torch.flatten(x, 1)
        x = self.fc(x)
        x = self.bn(x)
        return F.normalize(x, p=2, dim=1)


class FaceEmbedder:

    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model  = self._load_model()
        self.transform = transforms.Compose([
            transforms.Resize((112, 112)),
            transforms.ToTensor(),
            transforms.Normalize([0.5]*3, [0.5]*3)
        ])
        print(f"[FaceEmbedder] Use: {self.device}")
        if self.device.type == "cuda":
            print(f"[FaceEmbedder] GPU: {torch.cuda.get_device_name(0)}")

    def _load_model(self) -> FaceNet:
        """Load best_model.pth từ đường dẫn trong config."""
        model = FaceNet(settings.embedding_size)
        state_dict = torch.load(
            settings.model_path,
            map_location=self.device
        )
        model.load_state_dict(state_dict)
        model.to(self.device)
        model.eval()
        print(f"[FaceEmbedder] Loaded model from {settings.model_path}")
        return model

    def get_embedding(self, face_array: np.ndarray) -> list[float]:
        """
        Nhận ảnh khuôn mặt đã crop (numpy BGR 112x112)
        → trả về embedding vector 512 chiều.
        """
        rgb    = cv2.cvtColor(face_array, cv2.COLOR_BGR2RGB)
        pil    = Image.fromarray(rgb)
        tensor = self.transform(pil).unsqueeze(0).to(self.device)

        with torch.no_grad():
            embedding = self.model(tensor)

        return embedding[0].cpu().tolist()


face_embedder = FaceEmbedder()