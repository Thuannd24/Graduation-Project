"""Bước 1: dựng bộ dữ liệu bỏ-giỏ-hàng từ clickstream THẬT (RetailRocket).

Mục tiêu thí nghiệm: tách rõ các nhóm feature để trả lời "rule có chạm tới được không":

  - Nhóm A (RULE TRUY CẬP ĐƯỢC): mọi đại lượng vô hướng mà một người có thể đặt ngưỡng —
    số đếm, vị trí, khoảng thời gian đơn lẻ, giờ/thứ. Cho rule TẤT CẢ những thứ này (cố ý
    hào phóng với rule, để nếu rule thua thì kết luận mới đáng tin).
  - Nhóm B_SESS (CHỈ MÔ HÌNH DÙNG ĐƯỢC): thứ tự **trong phiên** — hành động liền trước và
    đếm bigram chuyển trạng thái, RESET ở đầu mỗi phiên.
  - Nhóm B_VIS: đúng nhóm B của bản trước — thứ tự tính xuyên suốt cả đời visitor, KHÔNG
    reset theo phiên. Giữ lại **có chủ đích** để đo tác động của lỗi đã sửa (xem dưới).

## ❗ LỖI ĐÃ SỬA Ở BẢN NÀY (đọc trước khi so số cũ/mới)

Bản trước tính `prev_a1/a2/a3` và mọi bigram bằng `groupby("visitorid")` — tức KHÔNG cắt theo
phiên, dù `session_idx` đã được tính sẵn và dùng cho `session_pos`/`secs_in_session`. Hệ quả:
ở event đầu tiên của một phiên mới, "hành động liền trước" là hành động cuối của phiên TRƯỚC —
có thể cách đó hàng tuần; và một bigram bắc qua khe 3 tuần được đếm y hệt bigram cách nhau 8
giây. Thứ tự chỉ có nghĩa TRONG phiên, nên cách tính cũ làm loãng tín hiệu thứ tự về nhiễu.

Điều này khiến kết luận cũ ("thứ tự không mang thông tin gì", ΔAUC −0,0009) KHÔNG có giá trị:
phép đo không kiểm tra đúng giả thuyết nó tuyên bố kiểm tra. Thí nghiệm tổng hợp có kiểm soát
(`synthetic_sequence_dgp.py`) lấy 1 PHIÊN làm 1 mẫu, nên hai bên trước đây đo hai thứ khác nhau.

Giữ song song B_SESS và B_VIS để lần chạy này **định lượng được** chênh lệch do lỗi đó gây ra,
thay vì chỉ khẳng định.

## Sửa kèm (nhỏ hơn)

- Bigram trước đây hardcode 8 tổ hợp, **thiếu `3_3`** và thiếu toàn bộ nhóm bắt đầu-chuỗi.
  Nay sinh đủ theo tổ hợp: prev ∈ {0=không có tiền đề, 1, 2, 3} × cur ∈ {1, 2, 3} = 12.
- Thêm `dt_prev_in_session` (NaN ở đầu phiên) tách khỏi `dt_prev` (khoảng cách xuyên phiên) —
  hai đại lượng có ý nghĩa khác hẳn nhau, trước đây bị gộp làm một.
- Thêm cột chẩn đoán `bought_other_item_24h`: nhãn hiện tại là "có mua ĐÚNG item này trong 24h
  không", nên một người thêm 3 món rồi cố ý chỉ mua 2 vẫn bị tính là "bỏ giỏ" ở món thứ 3.
  Cột này để ĐO xem phần đó chiếm bao nhiêu, chưa đổi nhãn chính.

CHỐNG RÒ RỈ (không đổi): mọi feature chỉ dùng event XẢY RA TRƯỚC thời điểm thêm giỏ — cumsum
theo nhóm rồi trừ chính event hiện tại.
"""
import json
import os

import pandas as pd

EVENTS_PATH = os.environ.get("RR_EVENTS_PATH", "/tmp/rr_events.csv")
OUT_PATH = os.environ.get("RR_DATASET_PATH", "/tmp/seq_dataset.csv")
GROUPS_PATH = os.environ.get("RR_GROUPS_PATH", "/tmp/feature_groups.json")
LABEL_WINDOW_HOURS = 24
SESSION_GAP_MINUTES = 30

ACTION_CODE = {"view": 1, "addtocart": 2, "transaction": 3}
# prev = 0 nghĩa là "không có tiền đề" (đầu phiên với B_SESS / đầu lịch sử với B_VIS).
BIGRAMS = [f"{prev}_{cur}" for prev in (0, 1, 2, 3) for cur in (1, 2, 3)]

VISITOR_KEYS = ["visitorid"]
SESSION_KEYS = ["visitorid", "session_idx"]


def cum_excluding_self(frame: pd.DataFrame, indicator: pd.Series, keys: list[str]) -> pd.Series:
    """Đếm luỹ tiến theo `keys` nhưng LOẠI chính hàng hiện tại — nền tảng chống rò rỉ."""
    tmp = "__ind__"
    frame[tmp] = indicator.astype("int32")
    result = frame.groupby(keys, sort=False)[tmp].cumsum() - frame[tmp]
    frame.drop(columns=tmp, inplace=True)
    return result.astype("int32")


print("Đọc events thật...")
df = pd.read_csv(EVENTS_PATH)
df["ts"] = pd.to_datetime(df["timestamp"], unit="ms")
df = df.sort_values(["visitorid", "ts"]).reset_index(drop=True)
print(f"  {len(df):,} event, {df.visitorid.nunique():,} visitor")

# --- Phiên: cắt khi im lặng > 30 phút (quy ước tiêu chuẩn của phân tích clickstream) ---
gap = df.groupby("visitorid")["ts"].diff()
df["new_session"] = (gap.isna()) | (gap > pd.Timedelta(minutes=SESSION_GAP_MINUTES))
df["session_idx"] = df.groupby("visitorid")["new_session"].cumsum()
print(f"  {df.groupby(SESSION_KEYS).ngroups:,} phiên (khe > {SESSION_GAP_MINUTES} phút)")

df["a"] = df["event"].map(ACTION_CODE).astype("int8")

# --- Hành động liền trước: BẢN TRONG PHIÊN (đúng) và BẢN XUYÊN PHIÊN (bản cũ, để đối chiếu) ---
by_visitor = df.groupby(VISITOR_KEYS, sort=False)
by_session = df.groupby(SESSION_KEYS, sort=False)
for lag in (1, 2, 3):
    df[f"sess_prev_a{lag}"] = by_session["a"].shift(lag).fillna(0).astype("int8")
    df[f"vis_prev_a{lag}"] = by_visitor["a"].shift(lag).fillna(0).astype("int8")

df["dt_prev"] = by_visitor["ts"].diff().dt.total_seconds()          # xuyên phiên
df["dt_prev2"] = by_visitor["ts"].diff(2).dt.total_seconds()
df["dt_prev_in_session"] = by_session["ts"].diff().dt.total_seconds()  # NaN ở đầu phiên

# --- Đếm luỹ tiến từng loại hành động: cả 2 phạm vi ---
for name, code in ACTION_CODE.items():
    indicator = df["a"] == code
    df[f"cum_{name}"] = cum_excluding_self(df, indicator, VISITOR_KEYS)
    df[f"sess_cum_{name}"] = cum_excluding_self(df, indicator, SESSION_KEYS)

# --- Bigram chuyển trạng thái luỹ tiến: TRONG PHIÊN (B_SESS) và XUYÊN PHIÊN (B_VIS) ---
df["sess_bigram"] = df["sess_prev_a1"].astype(str) + "_" + df["a"].astype(str)
df["vis_bigram"] = df["vis_prev_a1"].astype(str) + "_" + df["a"].astype(str)
for bg in BIGRAMS:
    df[f"sess_cum_bg_{bg}"] = cum_excluding_self(df, df["sess_bigram"] == bg, SESSION_KEYS)
    df[f"vis_cum_bg_{bg}"] = cum_excluding_self(df, df["vis_bigram"] == bg, VISITOR_KEYS)
df.drop(columns=["sess_bigram", "vis_bigram"], inplace=True)

# --- Số lần đã xem CHÍNH item này trước đó ---
df["cum_views_this_item"] = cum_excluding_self(df, df["a"] == 1, ["visitorid", "itemid"])

# --- Vị trí trong lịch sử / phiên ---
df["event_pos"] = by_visitor.cumcount()
df["session_pos"] = by_session.cumcount()
df["secs_since_first"] = (df["ts"] - by_visitor["ts"].transform("first")).dt.total_seconds()
df["secs_in_session"] = (df["ts"] - by_session["ts"].transform("first")).dt.total_seconds()
df["session_idx_num"] = df["session_idx"].astype("int32")  # phiên thứ mấy của visitor

# --- NHÃN THẬT: mỗi addtocart có transaction CÙNG ITEM trong 24h sau không? ---
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

# --- Cột CHẨN ĐOÁN (không phải feature): có mua MÓN KHÁC trong 24h không? ---
# Nếu tỉ lệ này cao trong nhóm "abandoned" thì nhãn hiện tại đang gộp "bỏ giỏ thật" với
# "chọn món khác trong cùng giỏ" — hai hiện tượng khác nhau, và điều đó CHẶN TRẦN AUC.
any_trans = df.loc[df["event"] == "transaction", ["visitorid", "ts"]].rename(
    columns={"ts": "any_ts"}
)
m2 = carts[["visitorid", "itemid", "ts"]].merge(any_trans, on="visitorid", how="left")
m2["ok"] = (m2["any_ts"] >= m2["ts"]) & (
    m2["any_ts"] <= m2["ts"] + pd.Timedelta(hours=LABEL_WINDOW_HOURS)
)
any_conv = (
    m2.groupby(["visitorid", "itemid", "ts"])["ok"].max().rename("bought_anything_24h").reset_index()
)
carts = carts.merge(any_conv, on=["visitorid", "itemid", "ts"], how="left")
carts["bought_anything_24h"] = carts["bought_anything_24h"].fillna(False)
carts["bought_other_item_24h"] = (
    carts["bought_anything_24h"] & ~carts["converted"]
).astype("int8")

carts["hour"] = carts["ts"].dt.hour.astype("int8")
carts["dow"] = carts["ts"].dt.dayofweek.astype("int8")

FEATURES_A = [  # rule truy cập được: mọi vô hướng có thể đặt ngưỡng
    "cum_view", "cum_addtocart", "cum_transaction",
    "sess_cum_view", "sess_cum_addtocart", "sess_cum_transaction",
    "cum_views_this_item", "event_pos", "session_pos", "session_idx_num",
    "secs_since_first", "secs_in_session",
    "dt_prev", "dt_prev2", "dt_prev_in_session",
    "hour", "dow",
]
FEATURES_B_SESS = [f"sess_prev_a{i}" for i in (1, 2, 3)] + [
    f"sess_cum_bg_{bg}" for bg in BIGRAMS
]
FEATURES_B_VIS = [f"vis_prev_a{i}" for i in (1, 2, 3)] + [f"vis_cum_bg_{bg}" for bg in BIGRAMS]

ALL_FEATURES = FEATURES_A + FEATURES_B_SESS + FEATURES_B_VIS
keep = ["visitorid", "itemid", "ts", "abandoned", "bought_other_item_24h"] + ALL_FEATURES
out = carts[keep].copy()
out[ALL_FEATURES] = out[ALL_FEATURES].fillna(-1)

abandoned_mask = out["abandoned"] == 1
share_other = float(out.loc[abandoned_mask, "bought_other_item_24h"].mean())
print(f"\nMẫu: {len(out):,} | bỏ giỏ {out.abandoned.mean():.1%} | visitor {out.visitorid.nunique():,}")
print(f"A={len(FEATURES_A)} | B_SESS={len(FEATURES_B_SESS)} | B_VIS={len(FEATURES_B_VIS)}")
print(
    f"CHẨN ĐOÁN NHÃN: trong số bị gán 'bỏ giỏ', {share_other:.1%} thực ra ĐÃ MUA MÓN KHÁC "
    f"trong {LABEL_WINDOW_HOURS}h"
)

out.to_csv(OUT_PATH, index=False)
with open(GROUPS_PATH, "w", encoding="utf-8") as f:
    json.dump(
        {"A": FEATURES_A, "B_SESS": FEATURES_B_SESS, "B_VIS": FEATURES_B_VIS},
        f,
        ensure_ascii=False,
        indent=2,
    )
print(f"Đã lưu {OUT_PATH} + {GROUPS_PATH}")
