from __future__ import annotations

import argparse
from pathlib import Path
import cv2


def collect_faces(output_dir: Path, person_code: str, frames: int = 100, camera_index: int = 0) -> None:
    person_dir = output_dir / person_code
    person_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError("Khong the mo webcam. Kiem tra camera_index hoac quyen truy cap camera.")

    saved = 0
    print("Nhan phim SPACE de chup, Q de thoat.")
    try:
        while saved < frames:
            ok, frame = cap.read()
            if not ok:
                continue

            preview = frame.copy()
            cv2.putText(preview, f"Saved: {saved}/{frames}", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.imshow("Collect Faces", preview)
            key = cv2.waitKey(1) & 0xFF

            if key == ord("q"):
                break
            if key == ord(" "):
                file_path = person_dir / f"{person_code}_{saved:04d}.jpg"
                cv2.imwrite(str(file_path), frame)
                saved += 1

        print(f"Da luu {saved} anh vao: {person_dir}")
    finally:
        cap.release()
        cv2.destroyAllWindows()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Thu thap du lieu khuon mat tu webcam.")
    parser.add_argument("--person-code", required=True, help="Ma nhan vien, vi du EMP001")
    parser.add_argument("--frames", type=int, default=100, help="So frame can thu thap")
    parser.add_argument("--camera-index", type=int, default=0, help="Index webcam")
    parser.add_argument("--output-dir", default="dataset/raw", help="Thu muc luu anh goc")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    collect_faces(
        output_dir=Path(args.output_dir),
        person_code=args.person_code,
        frames=args.frames,
        camera_index=args.camera_index,
    )