"""Giai đoạn 1 — CHẤM ĐIỂM ĐỘ GIÀU của các bộ dữ liệu ứng viên.

Xem [`docs/canvas/feature-space-upgrade-plan.md`](../../../../docs/canvas/feature-space-upgrade-plan.md)
và [`recsys-execution-plan.md`](../../../../docs/canvas/recsys-execution-plan.md).

## Vì sao script này tồn tại

Bài học đắt nhất của phiên: **RetailRocket ghi là "clickstream thật" nhưng median 1 event/user và
mọi thuộc tính bị hash** — hai điều không hiện ra cho tới khi ĐO. Mọi kết luận về "thứ tự không mang
thông tin" đều là hệ quả của việc chọn bộ dữ liệu bằng mô tả thay vì bằng số.

Script này chấm điểm ứng viên theo **9 tiêu chí đo được**, trên dữ liệu thật, trước khi chọn nền cho
phần còn lại của đồ án.

## Ngưỡng CHỐT TRƯỚC KHI ĐO (cổng sang Giai đoạn 2)

    median event/user >= 10 · số loại hành vi >= 4 · số thực thể >= 3
    · nội dung item đọc được · khoảng thời gian >= 3 tháng

## Ghi chú về bộ nhớ

REES46 ~109M dòng (2 tháng) — không đọc hết vào RAM 16 GB được. Chiến lược:
  - quét toàn bộ CHỈ cột thời gian để lấy khoảng thời gian (rẻ)
  - các chỉ số còn lại tính trên **một tháng đầy đủ**, theo chunk, cộng dồn bằng Counter
  - session id hash sang int64 để Counter không nuốt RAM vì chuỗi UUID
Ghi rõ phạm vi của từng con số trong output — không trộn "đo trên 1 tháng" với "đo trên toàn bộ".
"""
from __future__ import annotations

import json
import os
from collections import Counter

import numpy as np
import pandas as pd

CHUNK = 5_000_000
MIN_HISTORY = 5

GATE = {
    "median_events_per_user": 10,
    "n_action_types": 4,
    "n_entities": 3,
    "item_content_readable": True,
    "span_days": 90,
}


class Adapter:
    """Chuẩn hoá mỗi bộ về cùng một khung cột để chấm điểm bằng CÙNG một đoạn code."""

    name: str
    files: list[str]
    time_col: str
    usecols: list[str]
    rename: dict[str, str]
    time_unit: str | None = None      # 'ms' nếu epoch, None nếu chuỗi ISO
    attr_cols: list[str] = []         # cột mô tả item (đánh giá tiêu chí 4)
    has_native_session: bool = False

    def read_chunks(self, path: str, cols: list[str]):
        for chunk in pd.read_csv(path, usecols=cols, chunksize=CHUNK):
            yield chunk.rename(columns=self.rename)


class RetailRocket(Adapter):
    name = "RetailRocket"
    time_col = "timestamp"
    time_unit = "ms"
    usecols = ["timestamp", "visitorid", "itemid", "event"]
    rename = {"visitorid": "user", "itemid": "item", "event": "action", "timestamp": "ts"}
    attr_cols = []
    has_native_session = False


class Rees46(Adapter):
    name = "REES46 multi-category store"
    time_col = "event_time"
    time_unit = None
    usecols = [
        "event_time", "event_type", "product_id", "category_id",
        "category_code", "brand", "price", "user_id", "user_session",
    ]
    rename = {
        "user_id": "user", "product_id": "item", "event_type": "action",
        "event_time": "ts", "user_session": "session",
    }
    attr_cols = ["category_id", "category_code", "brand", "price"]
    has_native_session = True


def scan_time_span(adapter: Adapter, paths: list[str]) -> dict:
    """Quét TOÀN BỘ file nhưng chỉ cột thời gian.

    Với timestamp dạng chuỗi ISO, lấy min/max **trên chuỗi** rồi mới parse đúng 2 giá trị biên —
    parse cả 109M dòng chỉ để tìm 2 mốc là lãng phí hàng chục phút.
    """
    lo, hi, total = None, None, 0
    for path in paths:
        for chunk in pd.read_csv(path, usecols=[adapter.time_col], chunksize=CHUNK):
            series = chunk[adapter.time_col]
            if adapter.time_unit:
                series = pd.to_datetime(series, unit=adapter.time_unit)
            total += len(series)
            lo = series.min() if lo is None else min(lo, series.min())
            hi = series.max() if hi is None else max(hi, series.max())
    if not adapter.time_unit:  # còn là chuỗi -> parse đúng 2 mốc biên
        lo, hi = pd.to_datetime(lo, format="mixed", utc=True), pd.to_datetime(hi, format="mixed", utc=True)
    return {
        "n_events_all_files": int(total),
        "first_event": str(lo),
        "last_event": str(hi),
        "span_days": round((hi - lo).total_seconds() / 86400, 1),
    }


def profile(adapter: Adapter, path: str, max_rows: int | None = None) -> dict:
    """Chấm điểm trên MỘT file, tuỳ chọn chỉ đọc `max_rows` dòng đầu.

    ⚠️ Cắt theo dòng = cắt theo THỜI GIAN (file xếp theo thời gian), nên lịch sử của mỗi user bị
    truncate ở biên cửa sổ ⇒ **median event/user bị HẠ THẤP** so với giá trị cả tháng. Sai lệch đi
    theo hướng bảo toàn: nếu mẫu cắt đã qua cổng thì cả tháng chắc chắn qua. Cửa sổ thực tế được
    tính và in ra để con số đọc được đúng ngữ cảnh.

    Ngược lại, thống kê theo ITEM cũng bị hạ thấp cùng lý do — nói rõ trong output.
    """
    per_user: Counter = Counter()
    per_item: Counter = Counter()
    per_session: Counter = Counter()
    actions: Counter = Counter()
    attr_nonnull: Counter = Counter()
    attr_nunique: dict[str, set] = {c: set() for c in adapter.attr_cols}
    n_rows = 0
    win_lo = win_hi = None

    cols = adapter.usecols
    for chunk in adapter.read_chunks(path, cols):
        if max_rows is not None and n_rows >= max_rows:
            break
        if max_rows is not None and n_rows + len(chunk) > max_rows:
            chunk = chunk.iloc[: max_rows - n_rows]
        n_rows += len(chunk)
        raw_ts = chunk["ts"]
        lo, hi = raw_ts.min(), raw_ts.max()
        win_lo = lo if win_lo is None else min(win_lo, lo)
        win_hi = hi if win_hi is None else max(win_hi, hi)
        per_user.update(chunk["user"].dropna().to_numpy().tolist())
        per_item.update(chunk["item"].dropna().to_numpy().tolist())
        actions.update(chunk["action"].to_numpy().tolist())
        if adapter.has_native_session:
            # hash sang int64: Counter trên hàng chục triệu UUID chuỗi sẽ nuốt hết RAM
            hashed = pd.util.hash_pandas_object(chunk["session"], index=False)
            per_session.update(hashed.to_numpy().tolist())
        for col in adapter.attr_cols:
            nonnull = chunk[col].notna()
            attr_nonnull[col] += int(nonnull.sum())
            if len(attr_nunique[col]) < 2_000_000:
                attr_nunique[col].update(chunk.loc[nonnull, col].unique().tolist())

    user_counts = np.fromiter(per_user.values(), dtype=np.int64)
    item_counts = np.fromiter(per_item.values(), dtype=np.int64)

    if adapter.time_unit:
        win_lo, win_hi = pd.to_datetime(win_lo, unit=adapter.time_unit), pd.to_datetime(win_hi, unit=adapter.time_unit)
    else:
        win_lo, win_hi = pd.to_datetime(win_lo, format="mixed", utc=True), pd.to_datetime(win_hi, format="mixed", utc=True)
    window_days = round((win_hi - win_lo).total_seconds() / 86400, 2)

    out = {
        "file": os.path.basename(path),
        "truncated_to_rows": max_rows,
        "window_days_measured": window_days,
        "window": f"{win_lo} -> {win_hi}",
        "n_events": int(n_rows),
        "n_users": int(len(per_user)),
        "n_items": int(len(per_item)),
        # (1) do dai chuoi
        "median_events_per_user": float(np.median(user_counts)),
        "mean_events_per_user": round(float(user_counts.mean()), 2),
        "pct_users_ge5": round(float((user_counts >= MIN_HISTORY).mean()), 4),
        "pct_users_ge10": round(float((user_counts >= 10).mean()), 4),
        "n_users_usable_ge5": int((user_counts >= MIN_HISTORY).sum()),
        # (2) bang chu cai hanh vi
        "n_action_types": len(actions),
        "action_distribution": {str(k): int(v) for k, v in actions.most_common()},
        # (9) mat do item
        "median_events_per_item": float(np.median(item_counts)),
        "pct_items_ge5": round(float((item_counts >= MIN_HISTORY).mean()), 4),
    }

    if adapter.has_native_session:
        session_counts = np.fromiter(per_session.values(), dtype=np.int64)
        out["n_sessions"] = int(len(per_session))
        out["mean_events_per_session"] = round(float(session_counts.mean()), 2)
        out["pct_sessions_ge2"] = round(float((session_counts >= 2).mean()), 4)
        out["session_source"] = "tuong minh trong du lieu"
    else:
        out["session_source"] = "phai suy bang heuristic khe 30 phut"

    if adapter.attr_cols:
        out["item_attributes"] = {
            col: {
                "coverage": round(attr_nonnull[col] / n_rows, 4),
                "n_distinct": len(attr_nunique[col]),
            }
            for col in adapter.attr_cols
        }
    return out


def score_against_gate(prof: dict, span: dict, adapter: Adapter) -> dict:
    n_entities = 1 + (1 if adapter.attr_cols else 0) + (1 if adapter.has_native_session else 0)
    if adapter.attr_cols:
        n_entities = 1 + len(adapter.attr_cols) + (1 if adapter.has_native_session else 0)
    readable = bool(
        adapter.attr_cols
        and any(prof.get("item_attributes", {}).get(c, {}).get("n_distinct", 0) > 1
                for c in adapter.attr_cols)
    )
    checks = {
        "median_events_per_user": (prof["median_events_per_user"], GATE["median_events_per_user"],
                                   prof["median_events_per_user"] >= GATE["median_events_per_user"]),
        "n_action_types": (prof["n_action_types"], GATE["n_action_types"],
                           prof["n_action_types"] >= GATE["n_action_types"]),
        "n_entities": (n_entities, GATE["n_entities"], n_entities >= GATE["n_entities"]),
        "item_content_readable": (readable, True, readable),
        "span_days": (span["span_days"], GATE["span_days"], span["span_days"] >= GATE["span_days"]),
    }
    return {
        "checks": {k: {"value": v[0], "required": v[1], "pass": bool(v[2])}
                   for k, v in checks.items()},
        "passes_gate": all(v[2] for v in checks.values()),
        "n_criteria_passed": sum(1 for v in checks.values() if v[2]),
    }


def survey(adapter: Adapter, paths: list[str], profile_path: str, max_rows: int | None = None) -> dict:
    print(f"\n=== {adapter.name} ===")
    span = scan_time_span(adapter, paths)
    print(f"  khoang thoi gian: {span['span_days']} ngay ({span['first_event']} -> {span['last_event']})")
    print(f"  tong event moi file: {span['n_events_all_files']:,}")
    prof = profile(adapter, profile_path, max_rows=max_rows)
    scope = f"{prof['n_events']:,} dong dau" if max_rows else "toan bo file"
    print(f"  pham vi do: {scope} = {prof['window_days_measured']} ngay ({prof['window']})")
    print(f"  [do tren {prof['file']}] {prof['n_events']:,} event / {prof['n_users']:,} user / {prof['n_items']:,} item")
    print(f"  median event/user: {prof['median_events_per_user']:.0f} | >=5: {prof['pct_users_ge5']:.1%}")
    print(f"  loai hanh vi: {prof['n_action_types']} -> {prof['action_distribution']}")
    print(f"  median event/item: {prof['median_events_per_item']:.0f} | >=5: {prof['pct_items_ge5']:.1%}")
    if "n_sessions" in prof:
        print(f"  session: {prof['n_sessions']:,} | {prof['mean_events_per_session']} event/session | >=2: {prof['pct_sessions_ge2']:.1%}")
    if "item_attributes" in prof:
        for col, info in prof["item_attributes"].items():
            print(f"    attr {col:16s} phu {info['coverage']:6.1%} | {info['n_distinct']:,} gia tri")
    gate = score_against_gate(prof, span, adapter)
    print(f"  >>> qua cong: {gate['passes_gate']} ({gate['n_criteria_passed']}/5 tieu chi)")
    return {"dataset": adapter.name, "span": span, "profile": prof, "gate": gate}


if __name__ == "__main__":
    import glob

    out_path = os.environ.get("SURVEY_OUT", "/tmp/dataset_richness.json")
    max_rows_env = os.environ.get("MAX_ROWS", "")
    max_rows = int(max_rows_env) if max_rows_env else None
    results = []

    rr_dir = os.environ.get("RR_DIR", "")
    if rr_dir:
        events = os.path.join(rr_dir, "events.csv")
        results.append(survey(RetailRocket(), [events], events))

    rees_dir = os.environ.get("REES46_DIR", "")
    if rees_dir:
        files = sorted(glob.glob(os.path.join(rees_dir, "**", "*.csv"), recursive=True))
        if not files:
            raise SystemExit(f"Khong tim thay .csv nao trong {rees_dir}")
        # chấm điểm chi tiết trên MỘT tháng (RAM 16 GB không ôm nổi cả 2), nhưng khoảng thời
        # gian vẫn quét trên TẤT CẢ file — ghi rõ phạm vi từng con số, không trộn lẫn
        # profile file NHO NHAT (thang dau) cho nhanh; khoang thoi gian van quet tat ca file
        results.append(survey(Rees46(), files, min(files, key=os.path.getsize), max_rows=max_rows))

    print("\n\n=== BANG SO SANH ===")
    header = f"{'tieu chi':30s}" + "".join(f"{r['dataset'][:22]:>24s}" for r in results)
    print(header)
    print("-" * len(header))

    def row(label: str, fn):
        line = f"{label:30s}"
        for r in results:
            try:
                line += f"{fn(r):>24s}"
            except Exception:
                line += f"{'-':>24s}"
        print(line)

    row("event (file duoc do)", lambda r: f"{r['profile']['n_events']:,}")
    row("user", lambda r: f"{r['profile']['n_users']:,}")
    row("item", lambda r: f"{r['profile']['n_items']:,}")
    row("median event/user", lambda r: f"{r['profile']['median_events_per_user']:.0f}")
    row("% user >=5 event", lambda r: f"{r['profile']['pct_users_ge5']:.1%}")
    row("so loai hanh vi", lambda r: str(r["profile"]["n_action_types"]))
    row("median event/item", lambda r: f"{r['profile']['median_events_per_item']:.0f}")
    row("% item >=5 event", lambda r: f"{r['profile']['pct_items_ge5']:.1%}")
    row("event/session", lambda r: f"{r['profile']['mean_events_per_session']:.2f}")
    row("nguon session", lambda r: r["profile"]["session_source"][:22])
    row("cua so DO duoc (ngay)", lambda r: f"{r['profile']['window_days_measured']:.1f}")
    row("khoang thoi gian TONG (ngay)", lambda r: f"{r['span']['span_days']:.0f}")
    row("QUA CONG", lambda r: f"{r['gate']['n_criteria_passed']}/5 {'PASS' if r['gate']['passes_gate'] else 'FAIL'}")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"gate_thresholds": GATE, "results": results}, f, ensure_ascii=False, indent=2)
    print(f"\nDa luu {out_path}")
