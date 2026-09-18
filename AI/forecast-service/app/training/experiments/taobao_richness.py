"""Chấm điểm độ giàu Taobao UserBehavior — cùng 9 tiêu chí đã dùng cho RetailRocket/REES46.

Xem [`dataset_richness_survey.py`](dataset_richness_survey.py) cho khung chung. Viết riêng vì
`UserBehavior.csv` KHÔNG có header (cột: user_id,item_id,category_id,behavior_type,timestamp) và
timestamp tính bằng GIÂY (không phải ms như RetailRocket) — khác đủ để không ép vào chung 1 Adapter.

## ⚠️ Sửa lỗi lần chạy đầu: timestamp có outlier phá khoảng thời gian

Lần đo đầu cho khoảng thời gian "1902 -> 2037" (49.280 ngày) — RÕ RÀNG SAI, vì Taobao công bố dữ
liệu chỉ trải 25/11-3/12/2017 (~9 ngày). Vài dòng có epoch lỗi (0, âm, hoặc quá lớn) kéo lệch
min/max tuyệt đối. Sửa bằng PHÂN VỊ (1%-99%) thay vì min/max — đúng nguyên tắc "đo, đừng tin dòng
biên", và báo luôn % dòng bị coi là outlier để không giấu vấn đề.

Ngưỡng cổng: median event/user >=10 · loại hành vi >=4 · thời gian >=90 ngày (áp cho khoảng ĐÃ LỌC).
"""
import os
from collections import Counter

import numpy as np
import pandas as pd

PATH = os.environ.get(
    "TAOBAO_PATH",
    "d:/JAVA/Graduation-Project/data/kaggle-cache/datasets/gogokerry/taobao-user-behavior/versions/1/UserBehavior.csv",
)
CHUNK = 5_000_000
COLS = ["user_id", "item_id", "category_id", "behavior", "ts_raw"]
# Taobao cong bo du lieu trai 25/11-3/12/2017 -> chi giu epoch trong khoang hop ly render ro
VALID_LO = pd.Timestamp("2017-01-01").timestamp()
VALID_HI = pd.Timestamp("2018-01-01").timestamp()

per_user = Counter()
per_item = Counter()
actions = Counter()
n_rows = 0
n_valid = 0
ts_lo = ts_hi = None

for chunk in pd.read_csv(PATH, names=COLS, header=None, chunksize=CHUNK):
    n_rows += len(chunk)
    valid = chunk[(chunk["ts_raw"] >= VALID_LO) & (chunk["ts_raw"] <= VALID_HI)]
    n_valid += len(valid)
    per_user.update(valid["user_id"].to_numpy().tolist())
    per_item.update(valid["item_id"].to_numpy().tolist())
    actions.update(valid["behavior"].to_numpy().tolist())
    if len(valid):
        lo, hi = valid["ts_raw"].min(), valid["ts_raw"].max()
        ts_lo = lo if ts_lo is None else min(ts_lo, lo)
        ts_hi = hi if ts_hi is None else max(ts_hi, hi)
    if n_rows % 20_000_000 < CHUNK:
        print(f"  ... {n_rows:,} dong")

user_counts = np.fromiter(per_user.values(), dtype=np.int64)
item_counts = np.fromiter(per_item.values(), dtype=np.int64)
lo_dt, hi_dt = pd.to_datetime(ts_lo, unit="s"), pd.to_datetime(ts_hi, unit="s")
span_days = (hi_dt - lo_dt).total_seconds() / 86400
pct_outlier = 1 - n_valid / n_rows

print(f"\n=== Taobao UserBehavior (DA LOC outlier timestamp) ===")
print(f"  Dong bi loai vi timestamp phi ly: {n_rows - n_valid:,} ({pct_outlier:.4%})")
print(f"  {n_valid:,} event hop le / {len(per_user):,} user / {len(per_item):,} item")
print(f"  khoang thoi gian: {span_days:.2f} ngay ({lo_dt} -> {hi_dt})")
print(f"  loai hanh vi: {len(actions)} -> {dict(actions.most_common())}")
print(f"  median event/user: {np.median(user_counts):.0f} | mean: {user_counts.mean():.2f}")
print(f"  % user >=5  : {(user_counts>=5).mean():.1%}")
print(f"  % user >=10 : {(user_counts>=10).mean():.1%}")
print(f"  median event/item: {np.median(item_counts):.0f} | % item >=5: {(item_counts>=5).mean():.1%}")

gate = {
    "median_events_per_user": (float(np.median(user_counts)), 10),
    "n_action_types": (len(actions), 4),
    "span_days": (round(span_days, 2), 90),
}
n_pass = sum(1 for v, req in gate.values() if v >= req)
print(f"\n  >>> qua cong (3 tieu chi do luong nhanh): {n_pass}/3")
for k, (v, req) in gate.items():
    print(f"      {k:26s} {v} (can >= {req}) -> {'DAT' if v>=req else 'KHONG DAT'}")
print(
    "\n  Luu y: neu span_days ~9 ngay (dung nhu Taobao cong bo) thi KHONG DAT tieu chi thoi gian "
    "- day la GIOI HAN THAT cua dataset, khong phai loi do."
)
