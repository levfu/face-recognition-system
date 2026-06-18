# Train (Kaggle)

import torch

torch.cuda.empty_cache()
free  = torch.cuda.mem_get_info()[0] / 1024**3
total = torch.cuda.mem_get_info()[1] / 1024**3
print(f"VRAM free: {free:.1f} GB / {total:.1f} GB")


# ── CELL 2: Define FaceNet + ArcFace ──
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models

class FaceNet(nn.Module):
    def __init__(self, embedding_size=512):
        super().__init__()
        backbone = models.resnet50(weights="IMAGENET1K_V1")
        self.backbone = nn.Sequential(*list(backbone.children())[:-1])
        self.embedding = nn.Sequential(
            nn.Flatten(),
            nn.Linear(2048, embedding_size),
            nn.BatchNorm1d(embedding_size)
        )

    def forward(self, x):
        x = self.backbone(x)
        x = self.embedding(x)
        return F.normalize(x, p=2, dim=1)


class ArcFaceLoss(nn.Module):
    def __init__(self, num_classes, embedding_size=512, s=64.0, m=0.5):
        super().__init__()
        self.s = s
        self.m = m
        self.weight = nn.Parameter(
            torch.FloatTensor(num_classes, embedding_size)
        )
        nn.init.xavier_uniform_(self.weight)

        self.cos_m = torch.cos(torch.tensor(m))
        self.sin_m = torch.sin(torch.tensor(m))
        self.th    = torch.cos(torch.tensor(torch.pi - m))
        self.mm    = torch.sin(torch.tensor(torch.pi - m)) * m

    def forward(self, embeddings, labels):
        cosine = F.linear(embeddings, F.normalize(self.weight))
        sine   = torch.sqrt((1.0 - cosine ** 2).clamp(0, 1))
        phi    = cosine * self.cos_m - sine * self.sin_m
        phi    = torch.where(cosine > self.th, phi, cosine - self.mm)

        one_hot = torch.zeros_like(cosine)
        one_hot.scatter_(1, labels.view(-1, 1).long(), 1)

        output  = (one_hot * phi) + ((1.0 - one_hot) * cosine)
        output *= self.s

        return F.cross_entropy(output, labels)

print("FaceNet + ArcFaceLoss defined successfully")





import torch
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from torch.optim import SGD
from torch.optim.lr_scheduler import StepLR

PROCESSED_DIR = "/kaggle/input/notebooks/phuslee/preprocessing/processed_data" 
EMBEDDING_SIZE  = 512
BATCH_SIZE      = 64
EPOCHS          = 30
DEVICE          = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using: {DEVICE}")
# ── CELL 3: DataLoader with 80/20 train/test split ──
import torch
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, transforms

PROCESSED_DIR  = "/kaggle/input/notebooks/phuslee/preprocessing/processed_data"
EMBEDDING_SIZE = 512
BATCH_SIZE     = 64
EPOCHS         = 30
DEVICE         = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using: {DEVICE}")

# Transform for train (with augmentation)
transform_train = transforms.Compose([
    transforms.Resize((112, 112)),
    transforms.RandomHorizontalFlip(),
    transforms.ColorJitter(0.2, 0.2, 0.2),
    transforms.ToTensor(),
    transforms.Normalize([0.5]*3, [0.5]*3)
])

# Transform for test (without augmentation)
transform_test = transforms.Compose([
    transforms.Resize((112, 112)),
    transforms.ToTensor(),
    transforms.Normalize([0.5]*3, [0.5]*3)
])

# Load entire dataset
full_dataset = datasets.ImageFolder(PROCESSED_DIR, transform=transform_train)
total        = len(full_dataset)
train_size   = int(0.8 * total)
test_size    = total - train_size

# Fixed split using seed
train_dataset, test_dataset = random_split(
    full_dataset,
    [train_size, test_size],
    generator=torch.Generator().manual_seed(42)
)

# Test set uses separate transform (no augmentation)
from torch.utils.data import Subset
from copy import deepcopy
test_full = deepcopy(full_dataset)
test_full.transform = transform_test
test_dataset = Subset(test_full, test_dataset.indices)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE,
                          shuffle=True,  num_workers=2, pin_memory=True)
test_loader  = DataLoader(test_dataset,  batch_size=BATCH_SIZE,
                          shuffle=False, num_workers=2, pin_memory=True)

NUM_CLASSES = len(full_dataset.classes)
print(f"Number of persons : {NUM_CLASSES}")
print(f"Train size        : {train_size} images")
print(f"Test size         : {test_size} images")
# ── DataLoader ──
transform = transforms.Compose([
    transforms.Resize((112, 112)),
    transforms.RandomHorizontalFlip(),       # light augment
    transforms.ColorJitter(0.2, 0.2, 0.2),
    transforms.ToTensor(),
    transforms.Normalize([0.5]*3, [0.5]*3)  # normalize to [-1, 1]
])

dataset    = datasets.ImageFolder(PROCESSED_DIR, transform=transform)
dataloader = DataLoader(dataset, batch_size=BATCH_SIZE,
                        shuffle=True, num_workers=2, pin_memory=True)

NUM_CLASSES = len(dataset.classes)
print(f"Number of persons: {NUM_CLASSES}")

# ── Model + Loss ──
model    = FaceNet(EMBEDDING_SIZE).to(DEVICE)
arcface  = ArcFaceLoss(NUM_CLASSES, EMBEDDING_SIZE).to(DEVICE)

optimizer = SGD(
    list(model.parameters()) + list(arcface.parameters()),
    lr=0.01, momentum=0.9, weight_decay=5e-4
)
scheduler = StepLR(optimizer, step_size=10, gamma=0.1)

# ── Training loop ──
best_loss = float("inf")

for epoch in range(EPOCHS):
    model.train()
    total_loss = 0

    for batch_idx, (images, labels) in enumerate(dataloader):
        images = images.to(DEVICE)
        labels = labels.to(DEVICE)

        optimizer.zero_grad()
        embeddings = model(images)
        loss = arcface(embeddings, labels)
        loss.backward()
        optimizer.step()

        total_loss += loss.item()

        if batch_idx % 50 == 0:
            print(f"Epoch {epoch+1}/{EPOCHS} | "
                  f"Batch {batch_idx}/{len(dataloader)} | "
                  f"Loss: {loss.item():.4f}")

    avg_loss = total_loss / len(dataloader)
    scheduler.step()
    print(f"\nEpoch {epoch+1} completed | Avg Loss: {avg_loss:.4f} | LR: {scheduler.get_last_lr()[0]:.6f}\n")

    # Save best model
    if avg_loss < best_loss:
        best_loss = avg_loss
        torch.save(model.state_dict(), "/kaggle/working/best_model.pth")
        print(f"Saved best model (loss={best_loss:.4f})")



# ── CELL 4: Training loop ──
from torch.optim import SGD
from torch.optim.lr_scheduler import StepLR

model   = FaceNet(EMBEDDING_SIZE).to(DEVICE)
arcface = ArcFaceLoss(NUM_CLASSES, EMBEDDING_SIZE).to(DEVICE)

optimizer = SGD(
    list(model.parameters()) + list(arcface.parameters()),
    lr=0.01, momentum=0.9, weight_decay=5e-4
)
scheduler = StepLR(optimizer, step_size=10, gamma=0.1)

best_acc = 0.0

for epoch in range(EPOCHS):
    # ── Train ──
    model.train()
    total_loss = 0

    for batch_idx, (images, labels) in enumerate(train_loader):
        images = images.to(DEVICE)
        labels = labels.to(DEVICE)

        optimizer.zero_grad()
        embeddings = model(images)
        loss = arcface(embeddings, labels)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
        optimizer.step()

        total_loss += loss.item()

        if batch_idx % 50 == 0:
            print(f"Epoch {epoch+1}/{EPOCHS} | "
                  f"Batch {batch_idx}/{len(train_loader)} | "
                  f"Loss: {loss.item():.4f}")

    avg_loss = total_loss / len(train_loader)
    scheduler.step()

    # ── Evaluate on test set ──
    model.eval()
    correct, total_test = 0, 0

    with torch.no_grad():
        for images, labels in test_loader:
            images = images.to(DEVICE)
            labels = labels.to(DEVICE)
            embeddings = model(images)
            cosine = F.linear(embeddings, F.normalize(arcface.weight))
            preds  = cosine.argmax(dim=1)
            correct    += (preds == labels).sum().item()
            total_test += labels.size(0)

    test_acc = correct / total_test * 100
    print(f"\nEpoch {epoch+1}/{EPOCHS} | "
          f"Avg Loss: {avg_loss:.4f} | "
          f"LR: {scheduler.get_last_lr()[0]:.6f} | "
          f"Test Acc: {test_acc:.2f}%\n")

    # Save based on test accuracy
    if test_acc > best_acc:
        best_acc = test_acc
        torch.save(model.state_dict(), "/kaggle/working/best_model.pth")
        print(f"Saved best model (acc={best_acc:.2f}%)")




# ── CELL 5: Test model after training ──
import os
from PIL import Image
from torchvision import transforms

print(os.listdir("/kaggle/working/"))

# Load best model
model_test = FaceNet(512)
model_test.load_state_dict(
    torch.load("/kaggle/working/best_model.pth", map_location="cpu")
)
model_test.eval()

# Try embedding 1 image
transform_infer = transforms.Compose([
    transforms.Resize((112, 112)),
    transforms.ToTensor(),
    transforms.Normalize([0.5]*3, [0.5]*3)
])

sample_path  = "/kaggle/input/notebooks/phuslee/preprocessing/processed_data"
first_person = os.listdir(sample_path)[0]
first_img    = os.listdir(os.path.join(sample_path, first_person))[0]
img_path     = os.path.join(sample_path, first_person, first_img)

img    = Image.open(img_path).convert("RGB")
tensor = transform_infer(img).unsqueeze(0)

with torch.no_grad():
    emb = model_test(tensor)

print(f"Embedding size : {emb.shape[1]}")          # should be 512
print(f"L2 norm        : {emb.norm().item():.4f}")  # should be ~1.0
print(f"Best test acc  : {best_acc:.2f}%")
print(f"First 5 nums   : {emb[0][:5].tolist()}")