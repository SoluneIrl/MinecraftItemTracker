from pathlib import Path
from PIL import Image
import csv
import re


BASE_DIR = Path(__file__).parent
ASSETS_DIR = BASE_DIR / "Assets" / "Items"
CSV_FILE = BASE_DIR / "data.csv"

IMAGE_EXTENSIONS = (".webp", ".png", ".jpg", ".jpeg", ".gif")

GIF_FRAME_MODE = "first"

renamed_count = 0

for file in list(ASSETS_DIR.iterdir()):

    if not file.is_file():
        continue

    if file.suffix.lower() not in IMAGE_EXTENSIONS:
        continue

    original_name = file.stem

    name = re.sub(
        r"_\([^)]*\).*",
        "",
        original_name,
        flags=re.IGNORECASE
    )

    name = re.sub(
        r"[_\s]+(JE|BE)\d+.*$",
        "",
        name,
        flags=re.IGNORECASE
    )

    name = name.replace("_", " ").strip()

    name = re.sub(r"\s+", " ", name)

    new_file = file.with_name(name + file.suffix)

    if file == new_file:
        continue

    if new_file.exists():
        print(f"[CONFLICT] {file.name} -> {new_file.name}")
        continue

    file.rename(new_file)

    renamed_count += 1

    print(f"[RENAMED] {file.name} -> {new_file.name}")

def pick_gif_frame(img):
    """Seek to the chosen frame of a GIF and return it as RGBA."""
    total_frames = getattr(img, "n_frames", 1)

    if GIF_FRAME_MODE == "middle":
        index = total_frames // 2
    elif GIF_FRAME_MODE == "last":
        index = total_frames - 1
    else:
        index = 0

    img.seek(index)
    return img.convert("RGBA")


converted_count = 0

for file in list(ASSETS_DIR.iterdir()):

    if not file.is_file():
        continue

    ext = file.suffix.lower()

    if ext not in (".png", ".gif"):
        continue

    webp_file = file.with_suffix(".webp")

    if webp_file.exists():
        print(f"[CONFLICT] {file.name} (WebP already exists)")
        continue

    try:
        with Image.open(file) as img:

            if ext == ".gif":
                frame = pick_gif_frame(img)
                frames_info = f" (frame from {getattr(img, 'n_frames', 1)})"
            else:
                frame = img
                frames_info = ""

            frame.save(
                webp_file,
                "WEBP",
                lossless=True,
                method=6
            )

        file.unlink()

        converted_count += 1

        print(f"[CONVERTED] {file.name} -> {webp_file.name}{frames_info}")

    except Exception as e:
        print(f"[ERROR] {file.name}: {e}")

print(f"\nTotal converted: {converted_count}")

existing_images = {}

with open(CSV_FILE, "r", newline="", encoding="utf-8-sig") as f:

    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames

    for row in reader:

        image_stem = Path(row["image"].strip()).stem.lower()

        existing_images[image_stem] = row

available_images = {}

for file in ASSETS_DIR.iterdir():

    if not file.is_file():
        continue

    if file.suffix.lower() not in IMAGE_EXTENSIONS:
        continue

    available_images[file.stem.lower()] = file.name

rows = []

new_items = 0
removed_items = 0

for stem, filename in available_images.items():

    if stem in existing_images:

        row = existing_images[stem].copy()

        row["image"] = filename

        if row["acquired"].strip().lower() != "yes":
            row["acquired"] = "no"

    else:

        row = {
            column: ""
            for column in fieldnames
        }

        row["image"] = filename
        row["acquired"] = "no"

        new_items += 1

        print(f"[ADDED] {filename}")

    rows.append(row)

for stem, row in existing_images.items():

    if stem not in available_images:

        removed_items += 1

        print(f"[REMOVED] {row['image']}")

rows.sort(
    key=lambda row: row["image"].casefold()
)

for index, row in enumerate(rows, start=1):

    row["number"] = str(index)

with open(CSV_FILE, "w", newline="", encoding="utf-8-sig") as f:

    writer = csv.DictWriter(
        f,
        fieldnames=fieldnames
    )

    writer.writeheader()
    writer.writerows(rows)

print(f"Files renamed      : {renamed_count}")
print(f"Files converted    : {converted_count}")
print(f"Total CSV entries  : {len(rows)}")
print(f"Available images   : {len(available_images)}")
print(f"New items added    : {new_items}")
print(f"Removed entries    : {removed_items}")
