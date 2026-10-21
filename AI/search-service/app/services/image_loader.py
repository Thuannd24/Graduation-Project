import hashlib
import io
import os
import time
from typing import Optional

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import search_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)


class InvalidImageError(ValueError):
    """Ảnh upload không hợp lệ (quá lớn, không phải ảnh, hỏng...) — endpoint trả 4xx thay vì 500."""


def _normalize(image: Image.Image, max_side: Optional[int] = None) -> Image.Image:
    # Xoay theo EXIF (ảnh chụp điện thoại) rồi đưa về RGB (bỏ alpha/palette) cho CLIP/YOLO
    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        # Ảnh sản phẩm PNG nền trong suốt: convert("RGB") thẳng sẽ biến nền thành ĐEN → CLIP
        # thấy "vật trên nền đen", lệch hẳn so với ảnh chụp thật. Ghép lên nền trắng.
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        image = background
    elif image.mode != "RGB":
        image = image.convert("RGB")
    if max_side and max(image.size) > max_side:
        # CLIP chỉ nhìn 224px — thu nhỏ để build index không giữ hàng GB pixel trong RAM
        image.thumbnail((max_side, max_side), Image.BICUBIC)
    return image


def _open_checked(data: bytes) -> Image.Image:
    """Mở + giải mã ảnh, chặn "bom giải nén" TRƯỚC khi cấp phát pixel.

    Một PNG ~60 byte có thể khai báo 20000x20000 px (400M px ~ 1,2GB RAM khi load). PIL chỉ ném
    `DecompressionBombError` — KHÔNG phải OSError — nên trước đây lọt qua except và endpoint trả 500.
    Kiểm `image.size` (đọc từ header, chưa giải mã) với ngưỡng riêng, thấp hơn ngưỡng mặc định của PIL."""
    try:
        image = Image.open(io.BytesIO(data))
        width, height = image.size
        if width * height > search_settings.MAX_IMAGE_PIXELS:
            raise InvalidImageError(
                f"Ảnh quá lớn ({width}x{height} px), tối đa {search_settings.MAX_IMAGE_PIXELS:,} px."
            )
        image.load()
    except InvalidImageError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError) as e:
        raise InvalidImageError("File tải lên không phải ảnh hợp lệ.") from e
    return image


def load_image_from_bytes(data: bytes) -> Image.Image:
    max_bytes = search_settings.MAX_UPLOAD_MB * 1024 * 1024
    if not data:
        raise InvalidImageError("File ảnh rỗng.")
    if len(data) > max_bytes:
        raise InvalidImageError(f"Ảnh vượt quá {search_settings.MAX_UPLOAD_MB}MB.")
    return _normalize(_open_checked(data))


def load_image_from_file(file_like) -> Image.Image:
    """Đọc ảnh từ file-like (UploadFile.file) → PIL.Image RGB."""
    return load_image_from_bytes(file_like.read())


def _cache_path(url: str) -> str:
    return os.path.join(search_settings.img_cache_dir, hashlib.sha1(url.encode("utf-8")).hexdigest() + ".img")


def _download(url: str, retries: int = 3) -> Optional[bytes]:
    """GET có retry cho lỗi mạng tạm thời (DNS, timeout, 5xx). 4xx thì bỏ luôn."""
    import requests

    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": search_settings.HTTP_USER_AGENT},
                timeout=search_settings.IMG_DOWNLOAD_TIMEOUT,
            )
            if 400 <= resp.status_code < 500:
                logger.warning(f"Ảnh không tồn tại ({resp.status_code}): {url}")
                return None
            resp.raise_for_status()
            return resp.content
        except Exception as e:
            if attempt == retries:
                logger.warning(f"Không tải được ảnh sau {retries} lần: {url}: {e}")
                return None
            time.sleep(attempt)
    return None


def load_image_from_url(url: str, max_side: Optional[int] = None) -> Optional[Image.Image]:
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
                return _normalize(Image.open(io.BytesIO(f.read())), max_side)
        except (UnidentifiedImageError, OSError):
            os.remove(cache_file)  # cache hỏng → tải lại

    data = _download(url)
    if data is None:
        return None
    try:
        image = _open_checked(data)
    except InvalidImageError as e:
        logger.warning(f"Ảnh hỏng/quá lớn, bỏ qua {url}: {e}")
        return None

    if search_settings.IMG_CACHE_ENABLED:
        os.makedirs(search_settings.img_cache_dir, exist_ok=True)
        with open(cache_file, "wb") as f:
            f.write(data)
    return _normalize(image, max_side)
