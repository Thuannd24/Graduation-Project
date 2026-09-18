"""Giai đoạn 1 — KHẢO SÁT TÍN HIỆU trên dữ liệu thật, TRƯỚC khi chọn bài toán.

## Vì sao script này tồn tại

Nguyên nhân gốc số 1 của lần làm trước: **bài toán được chốt trước, dữ liệu đi tìm sau**. Hệ quả
là ba lần phải uốn dữ liệu cho vừa bài toán (synthetic tự sinh → vòng tròn; Olist không có
clickstream → churn rate 97,3% thoái hoá; RetailRocket 3 loại event → thứ tự rỗng), và mọi kết
luận downstream đều bị chặn trần bởi chính lựa chọn đó.

Script này đảo lại thứ tự: **đo xem dữ liệu CÓ GÌ trước, rồi mới chọn bài toán.** Nó không train
model nào, không lưu gì vào production, không đưa ra kết luận — chỉ trả về các con số để đối chiếu
với tiêu chí đã đăng ký ở Giai đoạn 0.

## Tiêu chí Giai đoạn 0 (đăng ký TRƯỚC, không được sửa sau khi thấy số)

Một bài toán đáng dùng ML khi thoả CẢ 5:
  1. Không gian đầu ra lớn (≫ số nhánh người viết tay nổi) HOẶC cần kết hợp ≥3 chiều tương tác
  2. Nhãn quan sát trực tiếp, không phải định nghĩa nhân tạo bằng cửa sổ thời gian
  3. Dữ liệu thật, base rate không thoái hoá (5–95%)
  4. Có baseline tầm thường rõ ràng để so trước
  5. Đo được bằng metric xếp hạng, không phụ thuộc base rate

## Ba câu hỏi script trả lời

  A. **Gợi ý sản phẩm có khả thi không?** — mật độ tương tác lặp, độ dài lịch sử/visitor, độ thưa.
     Đây là ứng viên mạnh nhất cho tiêu chí 1: không ai viết tay nổi một bảng xếp hạng trên hàng
     trăm nghìn item. Nhưng khả thi hay không do MẬT ĐỘ quyết định, phải đo.
  B. **Baseline tầm thường mạnh cỡ nào?** — Recall@K của "phổ biến nhất toàn cục" và của
     "đồng-xuất-hiện với item liền trước". Bắt buộc đo TRƯỚC (bài học F1 ở base rate 70%).
  C. **`item_properties` có dùng được không?** — độ phủ của category/giá/tồn kho, và tồn kho có
     thực sự đổi theo thời gian không (giả thuyết "hàng hết bị gán nhầm thành bỏ giỏ").

Chạy:
    RR_DIR=/đường/dẫn/tới/retailrocket python signal_survey.py
"""
from __future__ import annotations

import json
import os
from collections import Counter, defaultdict

import pandas as pd

RR_DIR = os.environ.get("RR_DIR", "/tmp/retailrocket")
OUT_PATH = os.environ.get("SURVEY_OUT", "/tmp/signal_survey.json")
SESSION_GAP_MINUTES = 30
TOP_K = 20
MIN_HISTORY = 5          # visitor phải có >= ngần này tương tác mới dùng cho gợi ý
CHUNK = 2_000_000


def load_events() -> pd.DataFrame:
    df = pd.read_csv(os.path.join(RR_DIR, "events.csv"))
    df["ts"] = pd.to_datetime(df["timestamp"], unit="ms")
    return df.sort_values(["visitorid", "ts"]).reset_index(drop=True)


def survey_density(df: pd.DataFrame) -> dict:
    """A — mật độ: có đủ lịch sử mỗi visitor để học chuỗi không?"""
    per_visitor = df.groupby("visitorid").size()
    per_item = df.groupby("itemid").size()

    gap = df.groupby("visitorid")["ts"].diff()
    new_session = gap.isna() | (gap > pd.Timedelta(minutes=SESSION_GAP_MINUTES))
    session_idx = new_session.groupby(df["visitorid"]).cumsum()
    per_session = df.groupby([df["visitorid"], session_idx]).size()

    n_events, n_items = len(df), df["itemid"].nunique()
    n_visitors = df["visitorid"].nunique()
    return {
        "n_events": int(n_events),
        "n_visitors": int(n_visitors),
        "n_items": int(n_items),
        "events_by_type": df["event"].value_counts().to_dict(),
        # Độ dài lịch sử: quyết định model chuỗi có gì để đọc không
        "events_per_visitor_median": float(per_visitor.median()),
        "events_per_visitor_mean": round(float(per_visitor.mean()), 3),
        "pct_visitors_with_ge2": round(float((per_visitor >= 2).mean()), 4),
        "pct_visitors_with_ge5": round(float((per_visitor >= MIN_HISTORY).mean()), 4),
        "pct_visitors_with_ge10": round(float((per_visitor >= 10).mean()), 4),
        "n_visitors_usable_ge5": int((per_visitor >= MIN_HISTORY).sum()),
        # Phiên: nếu ~1 event/phiên thì gợi ý THEO PHIÊN không có ngữ cảnh để dùng
        "n_sessions": int(len(per_session)),
        "events_per_session_mean": round(float(per_session.mean()), 3),
        "pct_sessions_with_ge2": round(float((per_session >= 2).mean()), 4),
        # Item: item quá thưa thì không học được biểu diễn cho nó
        "pct_items_with_ge5": round(float((per_item >= 5).mean()), 4),
        "n_items_with_ge5": int((per_item >= 5).sum()),
        "sparsity": round(1 - n_events / (n_visitors * n_items), 8),
    }


def survey_recommendation_baselines(df: pd.DataFrame) -> dict:
    """B — baseline TẦM THƯỜNG trước: phổ biến toàn cục vs đồng-xuất-hiện.

    Giao thức: leave-last-out theo visitor (item cuối = test, phần trước = train). Chỉ dùng
    visitor có >= MIN_HISTORY tương tác. Thống kê phổ biến/đồng-xuất-hiện CHỈ tính trên phần
    train — không được nhìn item test, nếu không là rò rỉ.
    """
    per_visitor = df.groupby("visitorid").size()
    usable = per_visitor[per_visitor >= MIN_HISTORY].index
    sub = df[df["visitorid"].isin(usable)][["visitorid", "itemid"]]

    # tách item cuối cùng của mỗi visitor làm test
    is_last = ~sub["visitorid"].duplicated(keep="last")
    train, test = sub[~is_last], sub[is_last]

    popular = [i for i, _ in Counter(train["itemid"]).most_common(TOP_K)]
    popular_set = set(popular)

    # đồng-xuất-hiện: với mỗi item, các item hay đi kèm trong CÙNG visitor (chỉ dùng train)
    cooc: dict[int, Counter] = defaultdict(Counter)
    for _, grp in train.groupby("visitorid", sort=False):
        items = grp["itemid"].tolist()[-10:]  # giới hạn 10 item gần nhất để chặn bùng nổ cặp
        for a in items:
            for b in items:
                if a != b:
                    cooc[a][b] += 1

    last_train_item = train.groupby("visitorid")["itemid"].last()
    hits_pop = hits_cooc = total = 0
    for visitor, target in zip(test["visitorid"], test["itemid"]):
        total += 1
        if target in popular_set:
            hits_pop += 1
        anchor = last_train_item.get(visitor)
        if anchor is not None and anchor in cooc:
            if target in {i for i, _ in cooc[anchor].most_common(TOP_K)}:
                hits_cooc += 1

    recall_pop = hits_pop / total if total else 0.0
    recall_cooc = hits_cooc / total if total else 0.0
    return {
        "protocol": f"leave-last-out, visitor >= {MIN_HISTORY} tương tác, K={TOP_K}",
        "n_test_visitors": total,
        f"recall@{TOP_K}_popularity": round(recall_pop, 5),
        f"recall@{TOP_K}_cooccurrence": round(recall_cooc, 5),
        "cooccurrence_over_popularity": (
            round(recall_cooc / recall_pop, 2) if recall_pop > 0 else None
        ),
        "note": (
            "Nếu đồng-xuất-hiện hơn phổ biến nhiều lần thì CÓ cấu trúc khai thác được -> bài toán "
            "gợi ý qua được tiêu chí 1. Nếu xấp xỉ nhau thì dữ liệu quá thưa, đừng đi hướng này."
        ),
    }


def survey_item_properties() -> dict:
    """C — item_properties: độ phủ category/giá/tồn kho + tồn kho có đổi theo thời gian không."""
    wanted = {"categoryid", "available", "790"}
    seen: dict[str, set] = {k: set() for k in wanted}
    avail_values: dict[int, set] = defaultdict(set)
    rows = 0

    for part in ("item_properties_part1.csv", "item_properties_part2.csv"):
        path = os.path.join(RR_DIR, part)
        if not os.path.exists(path):
            continue
        for chunk in pd.read_csv(path, chunksize=CHUNK):
            rows += len(chunk)
            hit = chunk[chunk["property"].isin(wanted)]
            for prop, grp in hit.groupby("property"):
                seen[str(prop)].update(grp["itemid"].unique().tolist())
            av = hit[hit["property"] == "available"]
            for item_id, value in zip(av["itemid"], av["value"]):
                avail_values[item_id].add(str(value))

    changed = sum(1 for v in avail_values.values() if len(v) > 1)
    return {
        "property_rows_scanned": rows,
        "n_items_with_categoryid": len(seen["categoryid"]),
        "n_items_with_price_prop790": len(seen["790"]),
        "n_items_with_available": len(seen["available"]),
        "n_items_availability_CHANGED_over_time": changed,
        "pct_items_availability_changed": (
            round(changed / len(avail_values), 4) if avail_values else None
        ),
        "note": (
            "Tồn kho đổi theo thời gian là CƠ CHẾ NHÂN QUẢ trực tiếp của bỏ giỏ hàng. Tỉ lệ này "
            "cao nghĩa là nhãn 'bỏ giỏ' hiện tại đang lẫn 'hàng hết' — phải tách trước khi model hoá."
        ),
    }


if __name__ == "__main__":
    print("== Giai đoạn 1: khảo sát tín hiệu (không train gì) ==")
    events = load_events()
    result = {"A_density": survey_density(events)}
    print("  A. mật độ xong")
    result["B_recommendation_baselines"] = survey_recommendation_baselines(events)
    print("  B. baseline gợi ý xong")
    result["C_item_properties"] = survey_item_properties()
    print("  C. item_properties xong")

    print("\n" + json.dumps(result, ensure_ascii=False, indent=2, default=str))
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, default=str)
    print(f"\nĐã lưu {OUT_PATH}")
