# Train on Kaggle

import os
import re
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from PIL import Image
from collections import Counter
import warnings
warnings.filterwarnings("ignore")

dataset_path = "/kaggle/input/datasets/phuslee/dataset/dataset"


# 1. PARSE FILENAMES -> DATAFRAME
records = []
for fname in os.listdir(dataset_path):
    if not fname.endswith(".jpg"):
        continue
    # Parse: 000_f108.jpg
    match = re.match(r"(\d+)_f(\d+)\.jpg", fname)
    if match:
        person_id = int(match.group(1))   # Person ID 
        frame_id = int(match.group(2))    # Frame ID
        fpath = os.path.join(dataset_path, fname)   # File path
        size_kb = os.path.getsize(fpath) / 1024      # Size 
        records.append({
            "filename":  fname,
            "filepath":  fpath,
            "person_id": person_id,
            "frame_id":  frame_id,
            "size_kb":   round(size_kb, 2)
        })
df = pd.DataFrame(records).sort_values(["person_id", "frame_id"]).reset_index(drop = True)
print(f"Total images         : {len(df):,}")
print(f"Total persons (IDs)  : {df['person_id'].nunique()}")
print(f"Average images/person: {len(df)/df['person_id'].nunique():.1f}")
df.head(10)  





# 2. Distribution of images per person 
img_per_person = df.groupby("person_id").size()

fig, axes = plt.subplots(1, 2, figsize=(14, 4))

# Histogram
axes[0].hist(img_per_person.values, bins=30, color="#6366f1", edgecolor="white", linewidth=0.5)
axes[0].set_title("Distribution of images per person", fontsize=13)
axes[0].set_xlabel("Number of images")
axes[0].set_ylabel("Number of persons")

# Top 20 persons with the most images
top20 = img_per_person.nlargest(20)
axes[1].barh(
    [f"ID {i}" for i in top20.index],
    top20.values,
    color="#6366f1"
)
axes[1].invert_yaxis()
axes[1].set_title("Top 20 persons with the most images", fontsize=13)
axes[1].set_xlabel("Number of images")

plt.tight_layout()
plt.show()

print("\nStatistics of images per person:")
print(img_per_person.describe().round(1))







# 3. Analyze image dimensions
sample_df = df.sample(min(500, len(df)), random_state=42)

widths, heights = [], []
for fpath in sample_df["filepath"]:
    with Image.open(fpath) as img:
        w, h = img.size
        widths.append(w)
        heights.append(h)

sample_df = sample_df.copy()
sample_df["width"]  = widths
sample_df["height"] = heights
sample_df["ratio"]  = (sample_df["width"] / sample_df["height"]).round(2)

fig, axes = plt.subplots(1, 3, figsize=(15, 4))

axes[0].hist(widths,  bins=20, color="#10b981", edgecolor="white")
axes[0].set_title("Width distribution")
axes[0].set_xlabel("pixels")

axes[1].hist(heights, bins=20, color="#f59e0b", edgecolor="white")
axes[1].set_title("Height distribution")
axes[1].set_xlabel("pixels")

axes[2].hist(sample_df["ratio"], bins=20, color="#ef4444", edgecolor="white")
axes[2].set_title("Width/Height ratio")
axes[2].set_xlabel("ratio")

plt.tight_layout()
plt.show()

print(f"\nWidth  — min: {min(widths)}  max: {max(widths)}  average: {np.mean(widths):.0f}px")
print(f"Height — min: {min(heights)} max: {max(heights)} average: {np.mean(heights):.0f}px")






# 4. Analyze brightness
brightness_list = []
for fpath in sample_df["filepath"]:
    with Image.open(fpath) as img:
        gray = img.convert("L")
        brightness_list.append(np.array(gray).mean())

sample_df["brightness"] = brightness_list

plt.figure(figsize=(10, 4))
plt.hist(brightness_list, bins=40, color="#8b5cf6", edgecolor="white")
plt.axvline(np.mean(brightness_list), color="red", linestyle="--",
            label=f"Average: {np.mean(brightness_list):.1f}")
plt.title("Image brightness distribution (0=dark, 255=bright)")
plt.xlabel("Brightness")
plt.ylabel("Number of images")
plt.legend()
plt.show()

# Warning for too dark / too bright images
too_dark   = (sample_df["brightness"] < 50).sum()
too_bright = (sample_df["brightness"] > 220).sum()
print(f"  Images too dark (< 50)  : {too_dark}")
print(f"  Images too bright (> 220): {too_bright}")






# 5. Analyze file size
fig, axes = plt.subplots(1, 2, figsize=(12, 4))

axes[0].hist(df["size_kb"], bins=40, color="#0ea5e9", edgecolor="white")
axes[0].set_title("File size distribution (KB)")
axes[0].set_xlabel("KB")
axes[0].set_ylabel("Number of files")

# Boxplot by person (top 10)
top10_ids = img_per_person.nlargest(10).index
df_top10  = df[df["person_id"].isin(top10_ids)]
df_top10.boxplot(column="size_kb", by="person_id", ax=axes[1], grid=False)
axes[1].set_title("File size per person (top 10)")
axes[1].set_xlabel("Person ID")
axes[1].set_ylabel("KB")
plt.suptitle("")

plt.tight_layout()
plt.show()

print(f"\nFile size — min: {df['size_kb'].min()} KB  max: {df['size_kb'].max()} KB  "
      f"average: {df['size_kb'].mean():.1f} KB")








# 6. View sample images - 5x5 Grid
sample_ids = df["person_id"].unique()[:5]  # First 5 persons
fig, axes = plt.subplots(5, 5, figsize=(14, 14))
fig.suptitle("Sample images — 5 persons × 5 frames", fontsize=14)

for row, pid in enumerate(sample_ids):
    person_imgs = df[df["person_id"] == pid].sample(min(5, len(df[df["person_id"]==pid])),
                                                      random_state=42)
    for col, (_, r) in enumerate(person_imgs.iterrows()):
        img = mpimg.imread(r["filepath"])
        axes[row][col].imshow(img)
        axes[row][col].set_title(f"ID {pid} | f{r['frame_id']}", fontsize=8)
        axes[row][col].axis("off")

plt.tight_layout()
plt.show()





# 7. Check class imbalance
img_per_person_sorted = img_per_person.sort_values()
min_count = img_per_person_sorted.min()
max_count = img_per_person_sorted.max()
imbalance_ratio = max_count / min_count

print(f"\n Class imbalance:")
print(f"  Person with fewest images : {min_count} images")
print(f"  Person with most images   : {max_count} images")
print(f"  Imbalance ratio           : {imbalance_ratio:.1f}x")

if imbalance_ratio > 5:
    print("  High imbalance — consider this when training/enrolling")
else:
    print("  Relatively balanced")

# Grouping
bins = [0, 10, 50, 100, 500, 99999]
labels = ["<10", "10-50", "50-100", "100-500", ">500"]
groups = pd.cut(img_per_person, bins=bins, labels=labels).value_counts().sort_index()
print(f"\nGrouping by images/person:")
print(groups.to_string())





# 8. Summary
print("\n" + "="*50)
print(" DATASET SUMMARY")
print("="*50)
print(f"  Total images        : {len(df):,}")
print(f"  Total persons       : {df['person_id'].nunique()}")
print(f"  Images/person (avg) : {img_per_person.mean():.0f}")
print(f"  Images/person (med) : {img_per_person.median():.0f}")
print(f"  Avg dimensions      : {np.mean(widths):.0f} × {np.mean(heights):.0f} px")
print(f"  Avg brightness      : {np.mean(brightness_list):.1f}")
print(f"  Imbalance ratio     : {imbalance_ratio:.1f}x")
print("="*50)



# !pip install deepface -q
from deepface import DeepFace


result = DeepFace.represent(
    img_path="/kaggle/input/datasets/phuslee/dataset/dataset/000_f0.jpg",
    model_name="Facenet512",
    enforce_detection=False
)
print(len(result[0]["embedding"]))  # 512




import random

same_person  = []  # distance when same person
diff_person  = []  # distance when different persons

# Sample 50 pairs of the same person
for pid in random.sample(list(df["person_id"].unique()), 50):
    imgs = df[df["person_id"] == pid]["filepath"].tolist()
    if len(imgs) < 2:
        continue
    a, b = random.sample(imgs, 2)
    r = DeepFace.verify(a, b, model_name="Facenet512", enforce_detection=False)
    same_person.append(r["distance"])

# Sample 100 pairs of different persons
pids = list(df["person_id"].unique())
for _ in range(100):
    p1, p2 = random.sample(pids, 2)
    a = df[df["person_id"]==p1]["filepath"].sample(1).values[0]
    b = df[df["person_id"]==p2]["filepath"].sample(1).values[0]
    r = DeepFace.verify(a, b, model_name="Facenet512", enforce_detection=False)
    diff_person.append(r["distance"])

# Plot distance distribution
import matplotlib.pyplot as plt
plt.hist(same_person, bins=20, alpha=0.6, label="Same person", color="green")
plt.hist(diff_person,  bins=20, alpha=0.6, label="Different person", color="red")
plt.axvline(0.4, color="black", linestyle="--", label="Threshold 0.4")
plt.legend()
plt.title("Distance distribution — finding optimal threshold")
plt.show()




from sklearn.metrics import accuracy_score, classification_report

labels    = [1]*len(same_person) + [0]*len(diff_person)
distances = same_person + diff_person

best_threshold, best_acc = 0, 0
for t in [i/100 for i in range(20, 70)]:
    preds = [1 if d < t else 0 for d in distances]
    acc = accuracy_score(labels, preds)
    if acc > best_acc:
        best_acc, best_threshold = acc, t

print(f"Best threshold: {best_threshold}  |  Accuracy: {best_acc:.2%}")