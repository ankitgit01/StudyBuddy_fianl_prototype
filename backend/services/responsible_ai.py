from pathlib import Path
import tempfile
import io

import fitz
from azure.ai.contentsafety import ContentSafetyClient
from azure.ai.contentsafety.models import AnalyzeImageOptions, ImageData
from azure.core.credentials import AzureKeyCredential
from PIL import Image, ImageOps

from config import CONTENT_SAFETY_ENDPOINT, CONTENT_SAFETY_KEY


UNSAFE_UPLOAD_MESSAGE = (
    "The uploaded content goes against our safety guidelines. "
    "Please try a different file."
)

MAX_CONTENT_SAFETY_IMAGE_BYTES = 4 * 1024 * 1024
CONTENT_SAFETY_BLOCK_THRESHOLD = 1
MAX_PDF_PAGES_TO_SCAN = 3
MAX_EMBEDDED_IMAGES_PER_PAGE = 3


class UnsafeContentError(Exception):
    def __init__(self, message=UNSAFE_UPLOAD_MESSAGE, details=None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


client = ContentSafetyClient(
    endpoint=CONTENT_SAFETY_ENDPOINT,
    credential=AzureKeyCredential(CONTENT_SAFETY_KEY),
)


def check_image_safety(image_bytes):
    image_bytes = _fit_for_content_safety(image_bytes)
    response = client.analyze_image(
        AnalyzeImageOptions(image=ImageData(content=image_bytes))
    )

    result = {}
    for category in response.categories_analysis:
        result[str(category.category)] = category.severity

    return result


def is_safe(result, threshold=CONTENT_SAFETY_BLOCK_THRESHOLD):
    for severity in result.values():
        if severity >= threshold:
            return False
    return True


def validate_image_or_raise(image_bytes):
    for variant_name, variant_bytes in _image_variants(image_bytes):
        result = check_image_safety(variant_bytes)
        if not is_safe(result):
            raise UnsafeContentError(
                details={
                    "categories": result,
                    "source": variant_name,
                    "threshold": CONTENT_SAFETY_BLOCK_THRESHOLD,
                }
            )


def validate_pdf_bytes_or_raise(pdf_bytes: bytes):
    with tempfile.TemporaryDirectory(prefix="pdf_safety_") as temp_dir:
        pdf_path = Path(temp_dir) / "upload.pdf"
        pdf_path.write_bytes(pdf_bytes)

        doc = fitz.open(pdf_path)

        try:
            for index, page in enumerate(doc):
                if index >= MAX_PDF_PAGES_TO_SCAN:
                    break

                pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                page_bytes = pix.tobytes("png")

                try:
                    validate_image_or_raise(page_bytes)
                except UnsafeContentError as exc:
                    details = dict(exc.details)
                    details["page"] = index + 1
                    details["source"] = "rendered_page"
                    raise UnsafeContentError(
                        message=UNSAFE_UPLOAD_MESSAGE,
                        details=details,
                    ) from exc

                image_refs = list({img[0] for img in page.get_images(full=True)})[
                    :MAX_EMBEDDED_IMAGES_PER_PAGE
                ]
                for image_xref in image_refs:
                    try:
                        image_bytes = doc.extract_image(image_xref).get("image")
                    except Exception:
                        image_bytes = None

                    if not image_bytes:
                        continue

                    try:
                        validate_image_or_raise(image_bytes)
                    except UnsafeContentError as exc:
                        details = dict(exc.details)
                        details["page"] = index + 1
                        details["source"] = "embedded_image"
                        details["image_xref"] = image_xref
                        raise UnsafeContentError(
                            message=UNSAFE_UPLOAD_MESSAGE,
                            details=details,
                        ) from exc
        finally:
            doc.close()


def validate_upload_bytes_or_raise(file_bytes: bytes, filename: str):
    if filename.lower().endswith(".pdf"):
        validate_pdf_bytes_or_raise(file_bytes)
    else:
        validate_image_or_raise(file_bytes)


def _image_variants(image_bytes):
    yield "original", image_bytes

    try:
        image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(image).convert("RGB")
    except Exception:
        return

    yield "normalized_full", _encode_png(image)


def _encode_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _fit_for_content_safety(image_bytes: bytes) -> bytes:
    if len(image_bytes) <= MAX_CONTENT_SAFETY_IMAGE_BYTES:
        return image_bytes

    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image).convert("RGB")

    for max_dim in (1600, 1280, 1024, 768):
        resized = image.copy()
        resized.thumbnail((max_dim, max_dim))

        for quality in (90, 80, 70, 60):
            buffer = io.BytesIO()
            resized.save(buffer, format="JPEG", quality=quality, optimize=True)
            candidate = buffer.getvalue()
            if len(candidate) <= MAX_CONTENT_SAFETY_IMAGE_BYTES:
                return candidate

    buffer = io.BytesIO()
    image.resize((768, 768)).save(buffer, format="JPEG", quality=45, optimize=True)
    return buffer.getvalue()
