"""Hồ sơ dữ liệu REES46 đa ngành — cột, kiểu, rỗng, miền giá trị, quan hệ — để đối chiếu với schema DB hệ thống TRƯỚC khi transform.
Đọc --rows dòng đầu MỖI tháng (mặc định 5 triệu × 2). Kết quả: data/experiment-results/rees46_profile.json
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
import pandas as pd

ROOT = os.environ.get("REPO_ROOT", "D:/JAVA/Graduation-Project")
SRC = f"{ROOT}/data/kaggle-cache/datasets/mkechinov/ecommerce-behavior-data-from-multi-category-store/versions/8"
OUT = f"{ROOT}/data/experiment-results/rees46_profile.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=5_000_000)
    a = ap.parse_args()
    d = pd.concat([pd.read_csv(f"{SRC}/{f}", nrows=a.rows, dtype={"category_code": "string", "brand": "string",
                                                                   "user_session": "string", "event_type": "string"})
                   for f in ("2019-Oct.csv", "2019-Nov.csv")], ignore_index=True)
    res: dict = {"rows_profiled": int(len(d)), "columns": {}}
    for c in d.columns:
        s = d[c]
        info = {"pandas_dtype": str(s.dtype), "null_share": round(float(s.isna().mean()), 4), "n_unique": int(s.nunique())}
        if pd.api.types.is_numeric_dtype(s):
            info.update({"min": float(s.min()), "max": float(s.max())})
        else:
            lens = s.dropna().str.len()
            info.update({"len_min": int(lens.min()), "len_max": int(lens.max()), "examples": s.dropna().unique()[:3].tolist()})
        res["columns"][c] = info
    tz = d["event_time"].str.slice(20).value_counts().to_dict()
    res["event_time_suffix"] = tz
    res["event_type_counts"] = d["event_type"].value_counts().to_dict()
    res["price"] = {"zero_or_negative_share": round(float((d["price"] <= 0).mean()), 5),
                    "p50": float(d["price"].median()), "p99": float(d["price"].quantile(0.99))}
    # quan hệ
    sess_users = d.dropna(subset=["user_session"]).groupby("user_session")["user_id"].nunique()
    res["session_belongs_to_one_user_share"] = round(float((sess_users == 1).mean()), 5)
    prod_cats = d.groupby("product_id")["category_id"].nunique()
    res["product_has_one_category_share"] = round(float((prod_cats == 1).mean()), 5)
    cat_codes = d.dropna(subset=["category_code"]).groupby("category_id")["category_code"].nunique()
    res["category_id_has_one_code_share"] = round(float((cat_codes == 1).mean()), 5)
    coded_cats = set(d.loc[d["category_code"].notna(), "category_id"])
    res["category_id_sometimes_coded_sometimes_not"] = int(d.loc[d["category_code"].isna() & d["category_id"].isin(coded_cats), "category_id"].nunique())
    prod_price = d.groupby("product_id")["price"].agg(["min", "max"])
    res["product_price_changes_share"] = round(float((prod_price["max"] > prod_price["min"] * 1.001).mean()), 4)
    prod_brand = d.dropna(subset=["brand"]).groupby("product_id")["brand"].nunique()
    res["product_has_one_brand_share"] = round(float((prod_brand == 1).mean()), 5)
    # mua có qua giỏ trong cùng phiên không
    key = ["user_id", "user_session", "product_id"]
    pur = d[d["event_type"] == "purchase"][key].drop_duplicates()
    crt = d[d["event_type"] == "cart"][key].drop_duplicates()
    res["purchase_with_cart_same_session_share"] = round(float(pur.merge(crt, on=key, how="left", indicator=True)["_merge"].eq("both").mean()), 4)
    pv = d[d["event_type"] == "view"][key].drop_duplicates()
    res["purchase_with_view_same_session_share"] = round(float(pur.merge(pv, on=key, how="left", indicator=True)["_merge"].eq("both").mean()), 4)
    # nhiều purchase cùng SP trong 1 phiên = số lượng hay sự kiện lặp?
    pc = d[d["event_type"] == "purchase"].groupby(key).size()
    res["purchase_rows_per_session_product"] = {k: round(float(v), 4) for k, v in (pc.value_counts(normalize=True).head(4)).items()}
    ps = d[d["event_type"] == "purchase"].groupby(["user_id", "user_session"])["product_id"].nunique()
    res["distinct_products_per_purchase_session"] = {k: round(float(v), 4) for k, v in ps.value_counts(normalize=True).head(4).items()}
    res["exact_duplicate_rows_share"] = round(float(d.duplicated().mean()), 5)
    res["brand_null_when_code_null"] = round(float(d.loc[d["category_code"].isna(), "brand"].isna().mean()), 4)
    unc = d.loc[d["category_code"].isna(), "brand"].value_counts().head(15).to_dict()
    res["top_brands_in_uncoded"] = {k: int(v) for k, v in unc.items()}
    print(json.dumps(res, ensure_ascii=False, indent=1, default=str))
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()
