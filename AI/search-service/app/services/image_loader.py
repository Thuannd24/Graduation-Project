import hashlib
import io
import os
from typing import Optional

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import search_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)


class InvalidImageError(ValueError):
    """Ảnh upload không hợp lệ (quá lớn, không phải ảnh, hỏng...) — endpoint trả 4xx thay vì 500."""


def _normalize(image: Image.Image) -> Image.Image:
    # Xoay theo EXIF (ảnh chụp điện thoại) rồi đưa về RGB (bỏ alpha/palette) cho CLIP/YOLO
    image = ImageOps.exif_transpose(image)
    if image.mode != "RGB":
        image = image.convert("RGB")
    return image


def load_image_from_bytes(data: bytes) -> Image.Image:
    max_bytes = search_settings.MAX_UPLOAD_MB * 1024 * 1024
    if not data:
        raise InvalidImageError("File ảnh rỗng.")
    if len(data) > max_bytes:
        raise InvalidImageError(f"Ảnh vượt quá {search_settings.MAX_UPLOAD_MB}MB.")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError) as e:
        raise InvalidImageError("File tải lên không phải ảnh hợp lệ.") from e
    return _normalize(image)


def load_image_from_file(file_like) -> Image.Image:
    """Đọc ảnh từ file-like (UploadFile.file) → PIL.Image RGB."""
    return load_image_from_bytes(file_like.read())


def _cache_path(url: str) -> str:
    return os.path.join(search_settings.img_cache_dir, hashlib.sha1(url.encode("utf-8")).hexdigest() + ".img")


def load_image_from_url(url: str) -> Optional[Image.Image]:
    """
    Tải ảnh sản phẩm từ CDN (dùng khi build index). Có cache trên đĩa để build lại không phải tải lại.
    Trả None nếu tải/giải mã lỗi — caller bỏ qua ảnh đó thay vì dừng cả quá trình build.
    """
    if not url:
        return None

    cache_file = _cache_path(url)
    if search_settings.IMG_CACHE_ENABLED and os.path.exists(cache_file):
        try:
            with open(cache_file, "rb") as f:
                return _normalize(Image.open(io.BytesIO(f.read())))
        except (UnidentifiedImageError, OSError):
            os.remove(cache_file)  # cache hỏng → tải lại

    import requests

    try:
        resp = requests.get(
            url,
            headers={"User-Agent": search_settings.HTTP_USER_AGENT},
            timeout=search_settings.IMG_DOWNLOAD_TIMEOUT,
        )
        resp.raise_for_status()
        image = Image.open(io.BytesIO(resp.content))
        image.load()
    except Exception as e:
        logger.warning(f"Không tải được ảnh {url}: {e}")
        return None

    if search_settings.IMG_CACHE_ENABLED:
        os.makedirs(search_settings.img_cache_dir, exist_ok=True)
        with open(cache_file, "wb") as f:
            f.write(resp.content)
    return _normalize(image)
