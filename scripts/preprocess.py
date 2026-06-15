from __future__ import annotations

import argparse
from pathlib import Path
import sys
import cv2

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.face_detector import face_detector  # noqa: E402  # type: ignore[reportMissingImports]


def preprocess_dataset(raw_dir: Path, processed_dir: Path) -> None:
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)

    image_paths = sorted([p for p in raw_dir.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"}])
    if not image_paths:
        print("No images found in dataset/raw.")
        return

    total = len(image_paths)
    success = 0
    failed = 0

    for idx, image_path in enumerate(image_paths, start=1):
        rel = image_path.relative_to(raw_dir)
        target_path = processed_dir / rel.with_suffix(".jpg")
        target_path.parent.mkdir(parents=True, exist_ok=True)

        image_bytes = image_path.read_bytes()
        detected = face_detector.detect_from_bytes(image_bytes)
        if detected is None:
            failed += 1
            print(f"[{idx}/{total}] Skip (no face): {rel}")
            continue

        cv2.imwrite(str(target_path), detected.face_array)
        success += 1
        print(f"[{idx}/{total}] OK: {rel}")

    print(f"Preprocessing complete. Success: {success}, Failed: {failed}, Total: {total}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preprocess images from `dataset/raw` to `dataset/processed`.")
    parser.add_argument("--raw-dir", default="dataset/raw", help="Folder dataset raw")
    parser.add_argument("--processed-dir", default="dataset/processed", help="Aligned dataset directory.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    preprocess_dataset(Path(args.raw_dir), Path(args.processed_dir))