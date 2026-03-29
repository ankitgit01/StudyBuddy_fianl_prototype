import fitz  # PyMuPDF
import os
from PIL import Image


def pdf_to_images(pdf_path, output_dir="temp_pages"):
    os.makedirs(output_dir, exist_ok=True)

    doc = fitz.open(pdf_path)
    image_paths = []

    for i, page in enumerate(doc):
        pix = page.get_pixmap()
        img_path = os.path.join(output_dir, f"page_{i+1}.png")

        pix.save(img_path)
        image_paths.append({
            "page": i + 1,
            "path": img_path
        })

    return image_paths