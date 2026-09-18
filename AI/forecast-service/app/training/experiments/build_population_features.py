"""Ngày 2 — NHÓM D: thống kê mức DÂN SỐ (trục xuyên user).

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md).

## Vì sao nhóm này tồn tại

Mọi feature hiện có đều là thống kê **trong-user** (nhóm A) hoặc thuộc tính **của item tại thời
điểm t** (nhóm C). Chưa feature nào đi qua trục **xuyên user**: *"item/ngành hàng này bị NHỮNG NGƯỜI
KHÁC bỏ giỏ nhiều hay ít?"*.

## ⚠️ Bẫy chính: NHÃN CÓ ĐỘ TRỄ 24 GIỜ

Nhãn của một sự kiện tại *t* chỉ biết được tại **t + 24h** (phải chờ hết cửa sổ mới biết có mua
không). Nên khi tính thống kê cho một hàng tại thời điểm *t*, **chỉ được dùng nhãn của các sự kiện
đã ĐÓNG cửa sổ**, tức `t_j + 24h ≤ t`.

Dùng mọi sự kiện `t_j < t` là **rò rỉ tương lai** — với item hiếm, một sự kiện xảy ra 1 giờ trước
sẽ đưa nhãn chưa-thể-biết vào feature. Đây là dạng rò rỉ tinh vi và rất dễ bỏ sót; cài đặt bên dưới
sắp xếp theo `label_ts = t + 24h` rồi mới cộng dồn.

## Ba lớp chống rò rỉ

1. **Nhân quả thời gian + độ trễ nhãn** — như trên
2. **Loại chính nó** — hàng hiện tại không bao giờ đóng góp vào thống kê của chính nó (hệ quả tự
   nhiên của lớp 1: `t + 24h > t`)
3. **Làm mượt Bayes** — phần lớn item có <1 lần thêm giỏ; không làm mượt thì tỉ lệ ra 0 hoặc 1 và
   model học thuộc item id. `rate = (n_bỏ + m·p_toàn_cục) / (n_tổng + m)`, `m = 20`

`p_toàn_cục` cũng tính **cộng dồn theo thời gian**, không dùng base rate của cả bộ dữ liệu.

## Cố ý KHÔNG thêm

`conversion_rate = 1 − abandon_rate` — hàm tất định của cột đã có ⇒ **thông tin mới bằng 0**. Đúng
nguyên tắc đã lập ở mục "phép thử phân biệt mới vs xào lại".
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

DATASET_PATH = os.environ.get("RR_DATASET_PATH", "/tmp/seq_dataset.csv")
ITEM_PATH = os.environ.get("RR_ITEM_FEATURES_PATH", "/tmp/item_features.csv")
OUT_PATH = os.environ.get("RR_POP_FEATURES_PATH", "/tmp/population_features.csv")

LABEL_WINDOW = pd.Timedelta(hours=24)
SMOOTHING_M = 20.0
N_PRICE_BUCKETS = 10
KEY = ["visitorid", "itemid", "ts"]


def causal_rate(
    events: pd.DataFrame, entity: str, rows: pd.DataFrame, prefix: str
) -> pd.DataFrame:
    """Tỉ lệ bỏ giỏ lịch sử của `entity`, chỉ dùng sự kiện ĐÃ ĐÓNG cửa sổ nhãn tại thời điểm hàng.

    Trả về 2 cột: `<prefix>_abandon_rate` (đã làm mượt) và `<prefix>_n_prior` (độ tin cậy).
    """
    ev = events[[entity, "label_ts", "abandoned"]].dropna(subset=[entity]).sort_values("label_ts")
    ev["cum_ab"] = ev.groupby(entity)["abandoned"].cumsum()
    ev["cum_n"] = ev.groupby(entity).cumcount() + 1
    # tiên nghiệm toàn cục cũng cộng dồn theo thời gian (không dùng base rate cả bộ)
    ev["glob_ab"] = ev["abandoned"].cumsum()
    ev["glob_n"] = np.arange(1, len(ev) + 1)

    merged = pd.merge_asof(
        rows[["ts", entity]].sort_values("ts"),
        ev[["label_ts", entity, "cum_ab", "cum_n", "glob_ab", "glob_n"]],
        left_on="ts",
        right_on="label_ts",
        by=entity,
        direction="backward",
    )
    # tiên nghiệm toàn cục tại thời điểm ts: lấy riêng (không theo entity)
    glob = pd.merge_asof(
        rows[["ts"]].sort_values("ts"),
        ev[["label_ts", "glob_ab", "glob_n"]].rename(
            columns={"glob_ab": "g_ab", "glob_n": "g_n"}
        ),
        left_on="ts",
        right_on="label_ts",
        direction="backward",
    )
    p_global = (glob["g_ab"] / glob["g_n"]).fillna(0.5).to_numpy()

    n_prior = merged["cum_n"].fillna(0).to_numpy()
    n_ab = merged["cum_ab"].fillna(0).to_numpy()
    rate = (n_ab + SMOOTHING_M * p_global) / (n_prior + SMOOTHING_M)
    return pd.DataFrame(
        {f"{prefix}_abandon_rate": rate, f"{prefix}_n_prior": n_prior},
        index=rows.sort_values("ts").index,
    )


print("== Ngày 2 — Nhóm D: thống kê DÂN SỐ ==")
carts = pd.read_csv(DATASET_PATH, usecols=KEY + ["abandoned"])
carts["ts"] = pd.to_datetime(carts["ts"]).astype("datetime64[us]")

items = pd.read_csv(ITEM_PATH, usecols=KEY + ["item_category", "item_price"]).drop_duplicates(
    subset=KEY
)
items["ts"] = pd.to_datetime(items["ts"]).astype("datetime64[us]")
before = len(carts)
carts = carts.merge(items, on=KEY, how="left")
assert len(carts) == before, f"merge làm đổi số hàng: {before} -> {len(carts)}"

carts["item_category"] = carts["item_category"].replace(-1, np.nan)
carts["item_price"] = carts["item_price"].replace(-1, np.nan)
# thùng giá: phép biến đổi KHÔNG dùng nhãn (unsupervised) nên chia trên toàn bộ là chấp nhận được
carts["price_bucket"] = pd.qcut(
    carts["item_price"], N_PRICE_BUCKETS, labels=False, duplicates="drop"
)

carts = carts.sort_values("ts").reset_index(drop=True)
carts["label_ts"] = carts["ts"] + LABEL_WINDOW

parts = [
    causal_rate(carts, "itemid", carts, "item"),
    causal_rate(carts, "item_category", carts, "cat"),
    causal_rate(carts, "price_bucket", carts, "pricebkt"),
]
out = pd.concat([carts[KEY]] + parts, axis=1)

FEATURES_D = [c for c in out.columns if c not in KEY]
print(f"\n--- {len(FEATURES_D)} feature nhóm D ---")
for col in FEATURES_D:
    series = out[col]
    print(f"  {col:26s} median {series.median():9.4f} | zero-prior {float((series == 0).mean()):.1%}")

print("\n--- Mật độ lịch sử (quyết định thống kê có dùng được không) ---")
for level, col in (("item", "item_n_prior"), ("category", "cat_n_prior"), ("thùng giá", "pricebkt_n_prior")):
    s = out[col]
    print(f"  {level:10s} median {s.median():7.0f} | có >=5 sự kiện trước: {float((s >= 5).mean()):6.1%}")

out.to_csv(OUT_PATH, index=False)
print(f"\nĐã lưu {OUT_PATH}")
