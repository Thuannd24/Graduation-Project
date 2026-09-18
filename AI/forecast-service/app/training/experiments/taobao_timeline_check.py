"""Kiểm tra bất thường: Taobao công bố dữ liệu trải ~9 ngày (25/11-3/12/2017), nhưng đo được
285,75 ngày sau khi lọc outlier cực đoan. Phân phối theo NGÀY để biết đây là:

  (a) 9 ngày công bố chiếm áp đảo (>95% event), phần còn lại là nhiễu rải rác nhẹ -> vẫn dùng được,
      chỉ cần lọc thêm theo cửa sổ 9 ngày đó
  (b) event THẬT SỰ trải đều suốt 285 ngày -> cột timestamp của file mirror này không đáng tin,
      không nên dùng cho bất kỳ phép chia thời gian nào
"""
import os
from collections import Counter

import pandas as pd

PATH = os.environ.get(
    "TAOBAO_PATH",
    "d:/JAVA/Graduation-Project/data/kaggle-cache/datasets/gogokerry/taobao-user-behavior/versions/1/UserBehavior.csv",
)
CHUNK = 5_000_000
COLS = ["user_id", "item_id", "category_id", "behavior", "ts_raw"]

per_day = Counter()
n_rows = 0
for chunk in pd.read_csv(PATH, names=COLS, header=None, chunksize=CHUNK):
    n_rows += len(chunk)
    days = pd.to_datetime(chunk["ts_raw"], unit="s", errors="coerce").dt.date
    per_day.update(days.dropna().tolist())

total = sum(per_day.values())
series = pd.Series(per_day).sort_index()
print(f"Tong {n_rows:,} dong, {total:,} co timestamp hop le, {len(series)} ngay co du lieu\n")
print("--- 15 ngay nhieu event nhat ---")
top15 = series.sort_values(ascending=False).head(15)
print(top15.to_string())
print(f"\n15 ngay do chiem: {top15.sum()/total:.2%} tong so event")

window = pd.Timestamp("2017-11-25")
in_window = series[(series.index >= window.date()) & (series.index <= pd.Timestamp("2017-12-03").date())]
print(f"\nCua so cong bo chinh thuc (25/11-3/12/2017): {in_window.sum():,} event = {in_window.sum()/total:.2%}")
print(f"Ngoai cua so do: {total - in_window.sum():,} event = {(total-in_window.sum())/total:.2%}")
