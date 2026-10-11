"""Kiểm tra trực tiếp cơ chế "vì sao thêm feature có thể không tăng (thậm chí có vẻ giảm)".

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md).

Trực giác "đã là thông tin thì không thể làm giảm" đúng trong GIỚI HẠN dữ liệu vô hạn, KHÔNG đúng
với ước lượng trên mẫu hữu hạn — đây là hiện tượng kinh điển (variance inflation do đa cộng tuyến,
overfitting do thêm bậc tự do), không phải bug riêng của dự án này. Script này đo TRỰC TIẾP cơ chế
đó cho từng candidate: tương quan Spearman với feature production gần nhất.

  |rho| cao (> 0.7)  -> candidate gần như TRÙNG LẶP 1 feature production đã có. Thêm vào không có
                        thông tin mới để mất, chỉ có nhiễu ước lượng hệ số để mất (variance inflation
                        factor = 1/(1-rho^2); rho=0.93 -> VIF~7.4x).
  |rho| thấp (< 0.3)  -> candidate THẬT SỰ độc lập với 11 feature hiện có. Nếu loại này VẪN null,
                        đó mới là câu hỏi cần đào sâu tiếp — không giải thích được bằng trùng lặp.
"""
import json

from shared_common.config import shared_settings
from shared_common.features.assembler import FEATURE_COLUMNS
from shared_common.features.candidates import CANDIDATE_COLUMNS
from shared_common.pool import get_engine

from app.training.train import _build_training_panel

engine = get_engine(shared_settings.DB_NAME)
panel = _build_training_panel(engine, include_candidates=True)

corr = panel[FEATURE_COLUMNS + CANDIDATE_COLUMNS].corr(method="spearman")

print(f"{'candidate':32s} {'trung voi (production)':28s} {'|rho|':>7}  danh gia")
rows = []
for cand in CANDIDATE_COLUMNS:
    best_col, best_val = None, 0.0
    for prod in FEATURE_COLUMNS:
        v = abs(corr.loc[cand, prod])
        if v > best_val:
            best_col, best_val = prod, v
    label = "TRUNG LAP" if best_val > 0.7 else ("doc lap that" if best_val < 0.3 else "trung binh")
    rows.append({"candidate": cand, "most_correlated_production_feature": best_col,
                 "abs_spearman": round(float(best_val), 4), "assessment": label})
    print(f"{cand:32s} {best_col:28s} {best_val:7.4f}  {label}")

with open("/tmp/corr_audit.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)
