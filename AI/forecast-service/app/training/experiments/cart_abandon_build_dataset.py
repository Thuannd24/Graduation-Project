"""Bước 1: dựng bộ dữ liệu bỏ-giỏ-hàng từ clickstream THẬT (RetailRocket).

Mục tiêu thí nghiệm: tách rõ 2 nhóm feature để trả lời câu hỏi "rule có chạm tới được không":
  - Nhóm A (RULE TRUY CẬP ĐƯỢC): mọi đại lượng vô hướng mà một người có thể đặt ngưỡng —
    số đếm, tỉ lệ, số item khác nhau, khoảng thời gian đơn lẻ, giờ/thứ. Cho rule TẤT CẢ những
    thứ này (cố ý hào phóng với rule, để nếu rule thua thì kết luận mới đáng tin).
  - Nhóm B (CHỈ MÔ HÌNH DÙNG ĐƯỢC): thông tin phụ thuộc THỨ TỰ — hành động liền trước là gì,
    số lần chuyển trạng thái (bigram). Hai user có mọi con số nhóm A y hệt nhau vẫn khác nhau
    ở nhóm B nếu quỹ đạo khác nhau.

CHỐNG RÒ RỈ (quan trọng nhất): mọi feature chỉ dùng event XẢY RA TRƯỚC thời điểm thêm giỏ.
Cài đặt bằng cumsum theo từng visitor rồi shift(1) trong nhóm -> loại chính event hiện tại.
"""
import numpy as np
import pandas as pd

EVENTS_PATH = "/tmp/rr_events.csv"
OUT_PATH = "/tmp/seq_dataset.csv"
LABEL_WINDOW_HOURS = 24
SESSION_GAP_MINUTES = 30

print("Đọc events thật...")
df = pd.read_csv(EVENTS_PATH)
df["ts"] = pd.to_datetime(df["timestamp"], unit="ms")
df = df.sort_values(["visitorid", "ts"]).reset_index(drop=True)
print(f"  {len(df):,} event, {df.visitorid.nunique():,} visitor")

# --- Phiên: cắt khi im lặng > 30 phút (quy ước tiêu chuẩn của phân tích clickstream) ---
gap = df.groupby("visitorid")["ts"].diff()
df["new_session"] = (gap.isna()) | (gap > pd.Timedelta(minutes=SESSION_GAP_MINUTES))
df["session_idx"] = df.groupby("visitorid")["new_session"].cumsum()

# --- Mã hoá hành động + hành động liền trước (nguồn của nhóm B) ---
ACTION_CODE = {"view": 1, "addtocart": 2, "transaction": 3}
df["a"] = df["event"].map(ACTION_CODE).astype("int8")
g = df.groupby("visitorid", sort=False)
df["prev_a1"] = g["a"].shift(1).fillna(0).astype("int8")
df["prev_a2"] = g["a"].shift(2).fillna(0).astype("int8")
df["prev_a3"] = g["a"].shift(3).fillna(0).astype("int8")
df["dt_prev"] = g["ts"].diff().dt.total_seconds()
df["dt_prev2"] = g["ts"].diff(2).dt.total_seconds()

# --- Đếm luỹ tiến TRƯỚC event hiện tại (trừ chính nó ra để không rò rỉ) ---
for name, code in ACTION_CODE.items():
    df[f"_ind_{name}"] = (df["a"] == code).astype("int32")
for name in ACTION_CODE:
    csum = df.groupby("visitorid", sort=False)[f"_ind_{name}"].cumsum()
    df[f"cum_{name}"] = (csum - df[f"_ind_{name}"]).astype("int32")  # loại chính event hiện tại

# --- Bigram chuyển trạng thái luỹ tiến (THÔNG TIN THỨ TỰ - nhóm B) ---
# bigram tại mỗi event = (hành động trước -> hành động này). Đếm luỹ tiến, loại chính nó.
df["bigram"] = df["prev_a1"].astype(str) + "_" + df["a"].astype(str)
for bg in ["1_1", "1_2", "2_1", "2_2", "2_3", "1_3", "3_1", "3_2"]:
    ind = (df["bigram"] == bg).astype("int32")
    df[f"_bg_{bg}"] = ind
    csum = df.groupby("visitorid", sort=False)[f"_bg_{bg}"].cumsum()
    df[f"cum_bg_{bg}"] = (csum - ind).astype("int32")

# --- Số lần đã xem CHÍNH item này trước đó ---
df["_ind_view"] = (df["a"] == 1).astype("int32")
csum_item = df.groupby(["visitorid", "itemid"], sort=False)["_ind_view"].cumsum()
df["cum_views_this_item"] = (csum_item - df["_ind_view"]).astype("int32")

# --- Vị trí trong lịch sử / phiên ---
df["event_pos"] = df.groupby("visitorid", sort=False).cumcount()
df["session_pos"] = df.groupby(["visitorid", "session_idx"], sort=False).cumcount()
first_ts = df.groupby("visitorid", sort=False)["ts"].transform("first")
df["secs_since_first"] = (df["ts"] - first_ts).dt.total_seconds()
sess_first_ts = df.groupby(["visitorid", "session_idx"], sort=False)["ts"].transform("first")
df["secs_in_session"] = (df["ts"] - sess_first_ts).dt.total_seconds()

# --- NHÃN THẬT: mỗi addtocart có transaction cùng item trong 24h sau không? ---
carts = df[df["event"] == "addtocart"].copy()
trans = df.loc[df["event"] == "transaction", ["visitorid", "itemid", "ts"]].rename(
    columns={"ts": "trans_ts"}
)
m = carts[["visitorid", "itemid", "ts"]].merge(trans, on=["visitorid", "itemid"], how="left")
m["ok"] = (m["trans_ts"] >= m["ts"]) & (
    m["trans_ts"] <= m["ts"] + pd.Timedelta(hours=LABEL_WINDOW_HOURS)
)
conv = m.groupby(["visitorid", "itemid", "ts"])["ok"].max().rename("converted").reset_index()
carts = carts.merge(conv, on=["visitorid", "itemid", "ts"], how="left")
carts["converted"] = carts["converted"].fillna(False)
carts["abandoned"] = (~carts["converted"]).astype("int8")

FEATURES_A = [  # rule truy cập được: mọi vô hướng có thể đặt ngưỡng
    "cum_view", "cum_addtocart", "cum_transaction",
    "cum_views_this_item", "event_pos", "session_pos",
    "secs_since_first", "secs_in_session", "dt_prev", "dt_prev2",
    "hour", "dow",
]
FEATURES_B = [  # CHỈ model dùng được: phụ thuộc thứ tự
    "prev_a1", "prev_a2", "prev_a3",
    "cum_bg_1_1", "cum_bg_1_2", "cum_bg_2_1", "cum_bg_2_2",
    "cum_bg_2_3", "cum_bg_1_3", "cum_bg_3_1", "cum_bg_3_2",
]

carts["hour"] = carts["ts"].dt.hour.astype("int8")
carts["dow"] = carts["ts"].dt.dayofweek.astype("int8")

keep = ["visitorid", "itemid", "ts", "abandoned"] + FEATURES_A + FEATURES_B
out = carts[keep].copy()
out[FEATURES_A] = out[FEATURES_A].fillna(-1)

print(f"\nMẫu: {len(out):,} | bỏ giỏ {out.abandoned.mean():.1%} | visitor {out.visitorid.nunique():,}")
print(f"Nhóm A: {len(FEATURES_A)} feature | Nhóm B: {len(FEATURES_B)} feature")
out.to_csv(OUT_PATH, index=False)
with open("/tmp/feature_groups.txt", "w") as f:
    f.write(",".join(FEATURES_A) + "\n" + ",".join(FEATURES_B) + "\n")
print(f"Đã lưu {OUT_PATH}")
