from azure.ai.vision.imageanalysis import ImageAnalysisClient
from azure.ai.vision.imageanalysis.models import VisualFeatures
from azure.core.credentials import AzureKeyCredential

from config import VISION_ENDPOINT, VISION_KEY

client = ImageAnalysisClient(
    endpoint=VISION_ENDPOINT,
    credential=AzureKeyCredential(VISION_KEY)
)


# ─────────────────────────────────────────────
# SINGLE IMAGE OCR (URL)
# ─────────────────────────────────────────────
def extract_text_from_image(image_url):

    result = client.analyze_from_url(
        image_url=image_url,
        visual_features=[VisualFeatures.READ]
    )

    return _parse_result(result)


# ─────────────────────────────────────────────
# NEW: LOCAL IMAGE OCR (for PDF pages)
# ─────────────────────────────────────────────
def extract_text_from_local_image(image_path):

    with open(image_path, "rb") as f:
        result = client.analyze(
            image_data=f,
            visual_features=[VisualFeatures.READ]
        )

    return _parse_result(result)


# ─────────────────────────────────────────────
# COMMON PARSER
# ─────────────────────────────────────────────
def _parse_result(result):
    paragraphs = []

    if result.read is not None:
        for block in result.read.blocks:
            for line in block.lines:
                text = line.text

                conf_scores = [word.confidence for word in line.words]
                confidence  = sum(conf_scores) / len(conf_scores) if conf_scores else 0

                # Bounding box — normalised to 0–100% of image size
                bbox = None
                if line.bounding_polygon:
                    pts = line.bounding_polygon
                    xs  = [p.x for p in pts]
                    ys  = [p.y for p in pts]
                    bbox = {
                        "x"     : min(xs),
                        "y"     : min(ys),
                        "width" : max(xs) - min(xs),
                        "height": max(ys) - min(ys),
                    }

                paragraphs.append({
                    "text"            : text,
                    "confidence"      : round(confidence, 4),
                    "confusion_score" : round(1 - confidence, 4),
                    "confusion_label" : _conf_to_label(1 - confidence),
                    "confusion_color" : _conf_to_color(1 - confidence),
                    "bbox"            : bbox,   # pixel coordinates
                })

    return {
        "paragraphs"    : paragraphs,
        "equations"     : [],
        "bilingual_lines": [],
    }


def _conf_to_label(score: float) -> str:
    if score < 0.30:  return "clean"
    if score < 0.70:  return "medium"
    return "confused"


def _conf_to_color(score: float) -> str:
    if score < 0.30:  return "#43E97B"   # green
    if score < 0.70:  return "#FFB300"   # yellow
    return "#FF4F4F"                      # red


# ─────────────────────────────────────────────
# NEW: MULTI-PAGE OCR (PDF support)
# ─────────────────────────────────────────────
def ocr_multiple_pages(image_pages):
    """
    image_pages = [
        {"page": 1, "path": "..."},
        {"page": 2, "path": "..."}
    ]
    """
    results = []

    for item in image_pages:
        page_no = item["page"]
        path    = item["path"]

        try:
            ocr_result = extract_text_from_local_image(path)
            paragraphs = ocr_result["paragraphs"]
            full_text  = "\n".join([p["text"] for p in paragraphs])

            results.append({
                "page"      : page_no,
                "path"      : path,          # ← keep path for heatmap drawing
                "text"      : full_text,
                "paragraphs": paragraphs,    # ← keep full paragraph data with bbox
            })

        except Exception as e:
            print(f"OCR failed for page {page_no}:", e)
            results.append({
                "page"      : page_no,
                "path"      : path,
                "text"      : "",
                "paragraphs": [],
            })

    return results