"""Ngày 1 của plan nâng cấp feature space — NHÓM C: thực thể SẢN PHẨM.

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md).

## Vì sao nhóm này tồn tại

Toàn bộ 17 feature hành vi hiện tại là hàm tổng hợp trên **một thực thể duy nhất** (visitor). Không
feature nào biết user đang bỏ giỏ **CÁI GÌ** — không giá, không ngành hàng, không tồn kho. Đây là
nguồn thông tin mới đầu tiên, và là nguồn rẻ nhất vì dữ liệu đã có sẵn.

## Điểm kỹ thuật quyết định: thuộc tính CÓ VERSION theo thời gian

`item_properties` là bảng dài `(timestamp, itemid, property, value)`, mỗi lần thuộc tính đổi là một
dòng mới. Với sự kiện thêm-giỏ tại thời điểm *t*, phải lấy bản ghi **mới nhất có timestamp ≤ t**
(`merge_asof` backward). Lấy bản mới nhất tuyệt đối là **rò rỉ tương lai** — đúng loại lỗi đã làm
AUC 0,9908 giả ở giai đoạn churn.

## ⚠️ `available` SAU t là CHẨN ĐOÁN, KHÔNG phải feature

Nếu item hết hàng trong 24h sau khi thêm giỏ thì "bỏ giỏ" không phải ý định người dùng — nó là hết
hàng. Dùng thông tin đó làm feature là rò rỉ tương lai. Nhưng **bắt buộc** đo nó để biết nhãn có
đang lẫn hai hiện tượng không.

Phép so quyết định: tỉ lệ hết-hàng trong nhóm **bỏ giỏ** so với nhóm **đã mua**. Nếu hai tỉ lệ bằng
nhau thì hết hàng KHÔNG giải thích được gì — nó chỉ là nhiễu nền, không phải confounder.

## Ghi chú về dữ liệu RetailRocket

Mọi `value` đều bị hash **trừ `categoryid` và `available`**. Số được giữ nguyên dưới dạng token
`n<số>` (vd `n277.200`). Property `790` là **giá**.
"""
from __future__ import annotations

import os
import re

import numpy as np
import pandas as pd

RR_DIR = os.environ.get("RR_DIR", "/tmp/retailrocket")
DATASET_PATH = os.environ.get("RR_DATASET_PATH", "/tmp/seq_dataset.csv")
OUT_PATH = os.environ.get("RR_ITEM_FEATURES_PATH", "/tmp/item_features.csv")
CHUNK = 2_000_000
LABEL_WINDOW_HOURS = 24

WANTED = {"categoryid", "available", "790"}
NUM_TOKEN = re.compile(r"n(-?\d+\.?\d*)")


def parse_numeric(value: str) -> float:
    """Lấy token số `n<số>` cuối cùng. Giá trị text bị hash nên chỉ token số là đọc được."""
    if not isinstance(value, str):
        return np.nan
    found = NUM_TOKEN.findall(value)
    return float(found[-1]) if found else np.nan


def load_properties() -> pd.DataFrame:
    frames = []
    for part in ("item_properties_part1.csv", "item_properties_part2.csv"):
        path = os.path.join(RR_DIR, part)
        if not os.path.exists(path):
            continue
        for chunk in pd.read_csv(path, chunksize=CHUNK):
            frames.append(chunk[chunk["property"].isin(WANTED)])
    props = pd.concat(frames, ignore_index=True)
    # ép cùng độ phân giải với phía cart: pandas >=3 từ chối merge_asof khi lệch us/ms
    props["ts"] = pd.to_datetime(props["timestamp"], unit="ms").astype("datetime64[us]")
    return props.sort_values("ts").reset_index(drop=True)


def asof_latest(carts: pd.DataFrame, prop_df: pd.DataFrame, colname: str) -> pd.Series:
    """Giá trị mới nhất của thuộc tính tại thời điểm <= ts của sự kiện (chống rò rỉ tương lai)."""
    right = prop_df[["ts", "itemid", "value"]].rename(columns={"value": colname})
    merged = pd.merge_asof(
        carts[["ts", "itemid"]].sort_values("ts"),
        right.sort_values("ts"),
        on="ts",
        by="itemid",
        direction="backward",
    )
    return merged[colname]


print("== Ngày 1 — Nhóm C: thực thể SẢN PHẨM ==")
carts = pd.read_csv(DATASET_PATH, usecols=["visitorid", "itemid", "ts", "abandoned"])
carts["ts"] = pd.to_datetime(carts["ts"]).astype("datetime64[us]")
carts = carts.sort_values("ts").reset_index(drop=True)
print(f"  {len(carts):,} sự kiện thêm-giỏ | bỏ giỏ {carts.abandoned.mean():.1%}")

props = load_properties()
print(f"  {len(props):,} bản ghi thuộc tính ({props.itemid.nunique():,} item)")

by_prop = {name: g for name, g in props.groupby("property", sort=False)}

# --- Thuộc tính TẠI thời điểm t (hợp lệ làm feature) ---
carts["item_category"] = pd.to_numeric(
    asof_latest(carts, by_prop["categoryid"], "item_category"), errors="coerce"
)
carts["item_available"] = pd.to_numeric(
    asof_latest(carts, by_prop["available"], "item_available"), errors="coerce"
)
carts["item_price"] = asof_latest(carts, by_prop["790"], "raw_price").map(parse_numeric)

# --- Cây ngành hàng: category cha (thô hơn ⇒ dày hơn, ít nhiễu hơn) ---
tree = pd.read_csv(os.path.join(RR_DIR, "category_tree.csv"))
parent = dict(zip(tree["categoryid"], tree["parentid"]))
carts["item_cat_parent"] = carts["item_category"].map(parent)
# độ sâu trong cây: leo lên tới gốc, chặn 10 bước phòng chu trình
depth_cache: dict[float, int] = {}


def cat_depth(cat) -> float:
    if pd.isna(cat):
        return np.nan
    if cat in depth_cache:
        return depth_cache[cat]
    d, cur = 0, cat
    while d < 10:
        nxt = parent.get(cur)
        if pd.isna(nxt) or nxt is None:
            break
        cur, d = nxt, d + 1
    depth_cache[cat] = d
    return d


carts["item_cat_depth"] = carts["item_category"].map(cat_depth)

# --- Tuổi item + số lần đổi thuộc tính TRƯỚC t ---
first_seen = props.groupby("itemid")["ts"].min().rename("item_first_seen")
carts = carts.merge(first_seen, left_on="itemid", right_index=True, how="left")
carts["item_age_days"] = (carts["ts"] - carts["item_first_seen"]).dt.total_seconds() / 86400

props_ordered = props.sort_values(["itemid", "ts"]).copy()
props_ordered["n_changes"] = props_ordered.groupby("itemid").cumcount() + 1
carts["item_n_prop_changes"] = pd.merge_asof(
    carts[["ts", "itemid"]].sort_values("ts"),
    props_ordered[["ts", "itemid", "n_changes"]].sort_values("ts"),
    on="ts",
    by="itemid",
    direction="backward",
)["n_changes"]

# --- ⚠️ CHẨN ĐOÁN (KHÔNG phải feature): item có hết hàng trong 24h sau t không? ---
avail = by_prop["available"].copy()
avail["v"] = pd.to_numeric(avail["value"], errors="coerce")
went_out = avail[avail["v"] == 0][["ts", "itemid"]].sort_values("ts")
nxt = pd.merge_asof(
    carts[["ts", "itemid"]].sort_values("ts"),
    went_out.rename(columns={"ts": "out_ts"}),
    left_on="ts",
    right_on="out_ts",
    by="itemid",
    direction="forward",
)
carts["stockout_within_24h"] = (
    (nxt["out_ts"] - nxt["ts"]).dt.total_seconds().between(0, LABEL_WINDOW_HOURS * 3600)
).fillna(False)

FEATURES_C = [
    "item_category", "item_cat_parent", "item_cat_depth",
    "item_price", "item_available", "item_age_days", "item_n_prop_changes",
]
carts["item_has_properties"] = carts["item_category"].notna().astype("int8")

out = carts[["visitorid", "itemid", "ts", "abandoned"] + FEATURES_C
            + ["item_has_properties", "stockout_within_24h"]].copy()
out[FEATURES_C] = out[FEATURES_C].fillna(-1)

print("\n--- Độ phủ nhóm C ---")
for col in FEATURES_C:
    print(f"  {col:24s} có giá trị: {(out[col] != -1).mean():6.1%}")

print("\n--- ⚠️ CHẨN ĐOÁN NHÃN: 'bỏ giỏ' có thực ra là HẾT HÀNG không? ---")
rate_ab = float(out.loc[out.abandoned == 1, "stockout_within_24h"].mean())
rate_cv = float(out.loc[out.abandoned == 0, "stockout_within_24h"].mean())
print(f"  Tỉ lệ hết hàng trong 24h — nhóm BỎ GIỎ : {rate_ab:.2%}")
print(f"  Tỉ lệ hết hàng trong 24h — nhóm ĐÃ MUA : {rate_cv:.2%}")
print(f"  Chênh lệch: {rate_ab - rate_cv:+.2%}")
print(
    "  ⇒ Hai tỉ lệ xấp xỉ nhau nghĩa là hết hàng KHÔNG giải thích được nhãn "
    "(nhiễu nền, không phải confounder)."
)

print("\n--- Giá theo nhãn (kiểm tra nhanh có tín hiệu không) ---")
priced = out[out.item_price != -1]
print(f"  Có giá: {len(priced):,} / {len(out):,} ({len(priced)/len(out):.1%})")
if len(priced):
    print(f"  Giá trung vị — bỏ giỏ: {priced.loc[priced.abandoned==1,'item_price'].median():,.1f}")
    print(f"  Giá trung vị — đã mua: {priced.loc[priced.abandoned==0,'item_price'].median():,.1f}")

out.to_csv(OUT_PATH, index=False)
print(f"\nĐã lưu {OUT_PATH} ({len(FEATURES_C)} feature nhóm C)")
