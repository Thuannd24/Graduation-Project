from typing import Dict, Optional, Tuple

from PIL import Image

from app.core.config import search_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)


class ProductCropper:
    """
    YOLOv8 detect & crop: cắt vùng sản phẩm nổi bật nhất trước khi CLIP encode, để nền/tay
    người cầm không làm lệch vector.

    - YOLO_ENABLED=false (mặc định) hoặc lỗi load model ⇒ trả nguyên ảnh, cropBox=None.
    - cropBox trả về theo % (0–100) của ảnh gốc: {x, y, width, height} — FE vẽ overlay trực tiếp.
    """

    def __init__(self):
        self._model = None
        self._load_failed = False

    def _get_model(self):
        if self._model is None and not self._load_failed:
            try:
                from ultralytics import YOLO  # lazy: ultralytics + weights chỉ cần khi bật YOLO
                logger.info(f"Loading YOLO weights: {search_settings.YOLO_WEIGHTS}")
                self._model = YOLO(search_settings.YOLO_WEIGHTS)
            except Exception as e:
                # Không retry mỗi request — tránh request nào cũng chậm vì cố load lại
                self._load_failed = True
                logger.error(f"Không load được YOLO, tắt crop: {e}")
        return self._model

    def warmup(self) -> None:
        if search_settings.YOLO_ENABLED:
            self._get_model()

    def crop(self, image: Image.Image) -> Tuple[Image.Image, Optional[Dict[str, float]]]:
        if not search_settings.YOLO_ENABLED:
            return image, None
        model = self._get_model()
        if model is None:
            return image, None

        try:
            result = model.predict(
                image,
                conf=search_settings.YOLO_CONF,
                iou=search_settings.YOLO_IOU,
                verbose=False,
            )[0]
        except Exception as e:
            logger.error(f"YOLO predict lỗi, dùng ảnh gốc: {e}")
            return image, None

        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            return image, None

        # Chọn box "chủ thể": ưu tiên to và tự tin — diện tích × confidence
        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        areas = (xyxy[:, 2] - xyxy[:, 0]) * (xyxy[:, 3] - xyxy[:, 1])
        x1, y1, x2, y2 = xyxy[int((areas * confs).argmax())]

        w, h = image.size
        pad_x = (x2 - x1) * search_settings.YOLO_PAD
        pad_y = (y2 - y1) * search_settings.YOLO_PAD
        x1, y1 = max(0.0, x1 - pad_x), max(0.0, y1 - pad_y)
        x2, y2 = min(float(w), x2 + pad_x), min(float(h), y2 + pad_y)
        if x2 - x1 < 8 or y2 - y1 < 8:
            return image, None

        cropped = image.crop((int(x1), int(y1), int(x2), int(y2)))
        crop_box = {
            "x": round(x1 / w * 100, 2),
            "y": round(y1 / h * 100, 2),
            "width": round((x2 - x1) / w * 100, 2),
            "height": round((y2 - y1) / h * 100, 2),
        }
        return cropped, crop_box


product_cropper = ProductCropper()
