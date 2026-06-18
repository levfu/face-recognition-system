# Preprocess (Kaggle)

import os
import glob
import pickle
import numpy as np
import pandas as pd
from tqdm import tqdm
from deepface import DeepFace

PROCESSED_DIR = "/kaggle/working/processed_data"
EMBEDDINGS_FILE = "/kaggle/working/embeddings.pkl"

# ==============================================================================
# 1. BATCH EMBEDDING EXTRACTION FROM CROPPED IMAGES (VECTORIZATION)
# ==============================================================================
print("Starting embedding extraction...")

# Get a list of all successfully cropped and aligned images
all_images = glob.glob(f"{PROCESSED_DIR}/**/*.jpg", recursive=True)
print(f"Total images for extraction: {len(all_images)}")

embeddings_dict = {}  # Storage format: { "filepath": embedding_vector, ... }
failed_embeddings = 0

# Use tqdm to display a progress bar
for img_path in tqdm(all_images, desc="Extracting"):
    try:
        # Use Facenet512. Since images are ALREADY CROPPED & ALIGNED, disable the detector
        result = DeepFace.represent(
            img_path=img_path,
            model_name="Facenet512",
            detector_backend="skip",     # Skip detector because the image is already a face
            align=False,                 # Skip alignment because the image is already aligned
            enforce_detection=False
        )
        
        # Save the embedding to the dictionary
        embeddings_dict[img_path] = result[0]["embedding"]
        
    except Exception as e:
        failed_embeddings += 1

print(f"Successfully extracted: {len(embeddings_dict)} images")
print(f"Extraction failed: {failed_embeddings} images")

# Save embeddings to a file for later use (no need to rerun this extraction step)
with open(EMBEDDINGS_FILE, "wb") as f:
    pickle.dump(embeddings_dict, f)
print(f"Saved embeddings dataset to: {EMBEDDINGS_FILE}")


# ==============================================================================
# 2. BUILD EMBEDDING DATASET (PANDAS DATAFRAME)
# ==============================================================================
records = []
for fpath, emb in embeddings_dict.items():
    # Parse person_id from the filename (e.g., 000_f108.jpg)
    filename = os.path.basename(fpath)
    person_id = int(filename.split("_")[0])
    
    records.append({
        "person_id": person_id,
        "filepath": fpath,
        "embedding": emb
    })

df_emb = pd.DataFrame(records)
print(f"Created Embedding DataFrame, shape: {df_emb.shape}")


# ==============================================================================
# 3. ENROLLMENT (CREATE A MEAN PROFILE FOR EACH PERSON)
# ==============================================================================
# Concept: For recognition, we don't need to compare against ALL images of a person. 
# We calculate a "mean vector" (centroid) from representative images to act as a Profile.

print("Creating Profile (Mean Vector) for each ID...")
profiles = {}

# Get IDs that have at least 2 images to create a reliable profile
valid_ids = df_emb['person_id'].value_counts()
valid_ids = valid_ids[valid_ids >= 2].index.tolist()

for pid in valid_ids:
    # Get all embeddings for this specific person
    person_embs = df_emb[df_emb["person_id"] == pid]["embedding"].tolist()
    
    # Calculate the mean across dimensions (creates the centroid vector)
    mean_vector = np.mean(person_embs, axis=0)
    
    # Normalize the mean vector (L2 normalization)
    mean_vector = mean_vector / np.linalg.norm(mean_vector)
    
    profiles[pid] = mean_vector

print(f"Successfully created Profiles for {len(profiles)} persons.")


# ==============================================================================
# 4. VERIFICATION & IDENTIFICATION TESTING USING MATRIX OPERATIONS
# ==============================================================================
from scipy.spatial.distance import cosine

# Randomly select a single image from the dataset for testing
test_sample = df_emb.sample(1).iloc[0]
test_id = test_sample["person_id"]
test_vector = np.array(test_sample["embedding"])
test_vector = test_vector / np.linalg.norm(test_vector) # Normalize test vector

print("\n--- IDENTIFICATION TEST ---")
print(f"Input image belongs to Person ID (Ground Truth): {test_id}")

# Compare the test vector against all Profiles in the database
distances = []
for pid, profile_vec in profiles.items():
    # Calculate Cosine distance (smaller value = more similar)
    dist = cosine(test_vector, profile_vec)
    distances.append((pid, dist))

# Sort distances in ascending order (smallest/most similar first)
distances.sort(key=lambda x: x[1])

# Get the top 3 best matches
print("Top 3 best matching IDs in the system:")
for i, (pred_id, dist) in enumerate(distances[:3]):
    match_status = "CORRECT" if pred_id == test_id else "INCORRECT"
    print(f" {i+1}. Predicted ID: {pred_id} | Cosine Distance: {dist:.4f} | {match_status}")