"""Thí nghiệm CÓ KIỂM SOÁT: khi nào rule thất bại về mặt cấu trúc, khi nào rule là đủ?

## Vì sao cần thí nghiệm này

Thí nghiệm trên clickstream thật (`cart_abandon_rule_vs_ml.py`) cho kết quả ÂM về thứ tự: bảng chữ
cái chỉ có 3 ký hiệu nên bigram trùng với số đếm, không có gì để thứ tự mang. Tracker vi hành vi mới
(18 ký hiệu) đã triển khai nhưng **chưa có traffic thật** để đo lại. Thay vì chờ vô định, ở đây dựng
thí nghiệm có kiểm soát để trả lời câu hỏi tổng quát hơn — và câu trả lời đó không phụ thuộc việc chờ
dữ liệu.

## Điểm cốt tử về tính trung thực: PHẢI có 2 DGP, không phải 1

Nếu chỉ thiết kế 1 bộ sinh dữ liệu có tương tác phức tạp rồi cho thấy ML thắng rule, thì tôi chỉ
chứng minh được "tôi tự thiết kế được dữ liệu đánh bại rule" — điều đó đúng một cách tầm thường và
KHÔNG có giá trị. Nên phải có **2 sự thật khác nhau trên CÙNG một tập phiên**:

- **DGP-A (dạng-rule)**: nhãn quyết định bởi 1 ngưỡng trên 1 đại lượng đếm được.
  → Kỳ vọng: **rule ĐỦ**, ML không hơn đáng kể.
- **DGP-B (dạng-tương-tác + thứ tự)**: nhãn quyết định bởi tương tác 3 chiều VÀ thứ tự 2 hành động
  liền kề, với **số đếm gần như y hệt** giữa nhóm rủi ro cao và thấp.
  → Kỳ vọng: **rule THẤT BẠI**, chỉ mô hình đọc được chuỗi mới bắt được.

Chỉ khi thấy **cả hai** kỳ vọng đúng thì thí nghiệm mới có tính phân biệt (discriminating). Nếu rule
thắng ở cả 2, hoặc ML thắng ở cả 2, thì kết luận là harness sai — và phải báo đúng như vậy.

## Sự thật tôi CỐ Ý thiết kế (khai báo minh bạch, vì tôi là người viết ra nó)

DGP-A: `P(bỏ giỏ)` cao khi `số lần COUPON_FAILED >= 1`. Một đại lượng đếm, một ngưỡng.

DGP-B: `P(bỏ giỏ)` cao **chỉ khi ĐỒNG THỜI** cả 3: (1) có COUPON_FAILED, (2) có VIEW_SHIPPING_FEE,
(3) có TAB_HIDDEN — **và** VIEW_SHIPPING_FEE xảy ra **ngay sau** COUPON_FAILED (thử tiết kiệm, thất
bại, rồi nhìn thấy phí ship → bỏ). Nhóm đối chứng có **đúng cùng 3 hành động đó, cùng số lượng**,
chỉ khác THỨ TỰ (nhìn phí ship trước, rớt mã sau) → mọi feature đếm **bằng nhau tuyệt đối**.

## Nhóm feature — chia theo "cái rule truy cập được"

- **Nhóm A**: số đếm từng loại action, độ dài phiên, tổng thời lượng, khoảng cách thời gian.
  Đây là những gì một người tự nhiên sẽ tính ra. **Cho rule tất cả.**
- **Nhóm B**: đếm bigram chuyển trạng thái — biểu diễn thứ tự **TỔNG QUÁT**, không phải feature
  tôi đẽo riêng cho DGP-B. Cố ý KHÔNG thêm feature kiểu `vị_trí(shipping) − vị_trí(coupon)` vì đó là
  đẽo đúng cơ chế đã biết trước; làm vậy chỉ chứng minh "nếu biết trước đáp án thì rule cũng làm
  được", không phải câu hỏi cần trả lời.

Chạy: `docker exec ai-forecast-service python /tmp/synthetic_sequence_dgp.py`
"""
from __future__ import annotations

import json
from collections import Counter

import lightgbm as lgb
import numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.tree import DecisionTreeClassifier

N_SESSIONS = 20_000
RANDOM_STATE = 42
N_SPLITS = 5
QUANTILES = np.arange(0.05, 1.0, 0.05)

# 18 ký hiệu — khớp shared_common/contracts.py (5 action cũ + 13 vi hành vi mới)
ACTIONS = [
    "VIEW_PRODUCT", "ADD_TO_CART", "UPDATE_CART_QTY", "REMOVE_FROM_CART", "CLEAR_CART",
    "VIEW_CART", "BEGIN_CHECKOUT", "VIEW_SHIPPING_FEE", "COUPON_FAILED", "COUPON_APPLIED",
    "TAB_HIDDEN", "TAB_VISIBLE", "SCROLL_DEPTH", "PAGE_DWELL", "PRODUCT_ZOOM",
    "SEARCH", "FILTER_APPLIED", "SORT_APPLIED",
]
IDX = {a: i for i, a in enumerate(ACTIONS)}


def simulate_sessions(rng: np.random.Generator) -> list[list[str]]:
    """Sinh chuỗi hành vi. CỐ Ý sinh chuỗi TRƯỚC và độc lập với nhãn — nhãn được gán sau, bằng 2 cách
    khác nhau (DGP-A/DGP-B) trên CÙNG các chuỗi này. Nhờ vậy mọi khác biệt giữa 2 DGP thuần do HÌNH
    DẠNG CỦA SỰ THẬT, không lẫn nhiễu lấy mẫu."""
    sessions = []
    for _ in range(N_SESSIONS):
        seq: list[str] = []

        # Duyệt sản phẩm: nhiễu nền, có ở mọi phiên
        for _ in range(rng.integers(1, 6)):
            seq.append("VIEW_PRODUCT")
            if rng.random() < 0.3:
                seq.append("SCROLL_DEPTH")
            if rng.random() < 0.15:
                seq.append("PRODUCT_ZOOM")
        if rng.random() < 0.3:
            seq.append("SEARCH")
        if rng.random() < 0.2:
            seq.append("SORT_APPLIED")
        if rng.random() < 0.2:
            seq.append("FILTER_APPLIED")

        seq.append("ADD_TO_CART")
        if rng.random() < 0.25:
            seq.append("UPDATE_CART_QTY")
        if rng.random() < 0.15:
            seq.append("REMOVE_FROM_CART")
        if rng.random() < 0.6:
            seq.append("VIEW_CART")

        # Các xác suất dưới đây đặt CAO để nhóm thoả mãn tương tác 3 chiều của DGP-B chiếm ~18% dân
        # số thay vì ~6%. Đây là điều chỉnh ĐỘ MẠNH THỐNG KÊ (để hiệu ứng đo được), KHÔNG phải tune
        # chiều hiệu ứng: câu hỏi khoa học là "rule có diễn đạt được tương tác + thứ tự hay không",
        # độ phổ biến của nhóm bị ảnh hưởng không thay đổi câu hỏi đó. Lần chạy đầu với ~6% cho AUC
        # chỉ 0,54-0,56 và phần hơn của thứ tự (+0,0131) suýt không vượt sàn nhiễu (0,0132) —
        # không đủ để kết luận, nên tăng độ phổ biến rồi đo lại.
        reached_checkout = rng.random() < 0.85
        if reached_checkout:
            seq.append("BEGIN_CHECKOUT")

            has_coupon_fail = rng.random() < 0.70
            has_shipping_view = rng.random() < 0.85
            # Thứ tự 2 hành động này là biến then chốt của DGP-B. Chọn 50/50, ĐỘC LẬP với mọi thứ
            # khác, nên số đếm của 2 nhóm thứ tự là như nhau về kỳ vọng.
            shipping_after_coupon = rng.random() < 0.5

            if has_coupon_fail and has_shipping_view:
                if shipping_after_coupon:
                    seq.extend(["COUPON_FAILED", "VIEW_SHIPPING_FEE"])
                else:
                    seq.extend(["VIEW_SHIPPING_FEE", "COUPON_FAILED"])
            elif has_coupon_fail:
                seq.append("COUPON_FAILED")
            elif has_shipping_view:
                seq.append("VIEW_SHIPPING_FEE")

            if rng.random() < 0.2:
                seq.append("COUPON_APPLIED")

        if rng.random() < 0.70:
            seq.extend(["TAB_HIDDEN", "TAB_VISIBLE"])
        seq.append("PAGE_DWELL")
        sessions.append(seq)
    return sessions


def label_dgp_a(seq: list[str], rng: np.random.Generator) -> int:
    """DẠNG-RULE: 1 ngưỡng trên 1 đại lượng đếm. `COUPON_FAILED >= 1` -> rủi ro cao."""
    p = 0.75 if seq.count("COUPON_FAILED") >= 1 else 0.25
    return int(rng.random() < p)


def label_dgp_b(seq: list[str], rng: np.random.Generator) -> int:
    """DẠNG-TƯƠNG-TÁC + THỨ TỰ: cao chỉ khi có ĐỦ 3 điều kiện VÀ đúng thứ tự.

    Nhóm đối chứng có y hệt 3 hành động đó với cùng số lượng, chỉ khác thứ tự -> mọi feature ĐẾM
    bằng nhau tuyệt đối, chỉ biểu diễn chuỗi mới phân biệt được.
    """
    has_all_three = (
        "COUPON_FAILED" in seq and "VIEW_SHIPPING_FEE" in seq and "TAB_HIDDEN" in seq
    )
    # Thứ tự liền kề: rớt mã RỒI mới nhìn phí ship
    order_bad = any(
        seq[i] == "COUPON_FAILED" and seq[i + 1] == "VIEW_SHIPPING_FEE"
        for i in range(len(seq) - 1)
    )
    p = 0.85 if (has_all_three and order_bad) else 0.20
    return int(rng.random() < p)


def extract_features(sessions: list[list[str]]) -> tuple[np.ndarray, np.ndarray, list[str], list[str]]:
    """Nhóm A = số đếm + độ dài (rule dùng được). Nhóm B = đếm bigram (biểu diễn thứ tự tổng quát)."""
    names_a = [f"n_{a}" for a in ACTIONS] + ["seq_len", "n_distinct_actions"]
    bigrams = [(a, b) for a in ACTIONS for b in ACTIONS]
    names_b = [f"bg_{a}__{b}" for a, b in bigrams]
    bg_idx = {pair: i for i, pair in enumerate(bigrams)}

    A = np.zeros((len(sessions), len(names_a)), dtype=np.float32)
    B = np.zeros((len(sessions), len(names_b)), dtype=np.float32)

    for r, seq in enumerate(sessions):
        counts = Counter(seq)
        for a in ACTIONS:
            A[r, IDX[a]] = counts.get(a, 0)
        A[r, len(ACTIONS)] = len(seq)
        A[r, len(ACTIONS) + 1] = len(counts)
        for i in range(len(seq) - 1):
            B[r, bg_idx[(seq[i], seq[i + 1])]] += 1
    return A, B, names_a, names_b


def best_rule_auc(X: np.ndarray, y: np.ndarray, splits) -> float:
    """Giới hạn trên của 'xếp hạng bằng 1 đại lượng': lấy AUC tốt nhất trong mọi cột nhóm A.
    Hào phóng với rule — nó được chọn cột tốt nhất mà không bị trừ điểm gì."""
    best = 0.5
    for c in range(X.shape[1]):
        aucs = []
        for _, te in splits:
            v = X[te, c]
            if len(np.unique(v)) < 2:
                continue
            a = roc_auc_score(y[te], v)
            aucs.append(max(a, 1 - a))
        if aucs and float(np.mean(aucs)) > best:
            best = float(np.mean(aucs))
    return round(best, 4)


def tree_auc(X: np.ndarray, y: np.ndarray, splits, depth: int) -> tuple[float, float]:
    aucs = []
    for tr, te in splits:
        t = DecisionTreeClassifier(max_depth=depth, random_state=RANDOM_STATE)
        t.fit(X[tr], y[tr])
        aucs.append(roc_auc_score(y[te], t.predict_proba(X[te])[:, 1]))
    return round(float(np.mean(aucs)), 4), round(float(np.std(aucs)), 4)


def lgb_auc(X: np.ndarray, y: np.ndarray, splits) -> tuple[float, float]:
    aucs = []
    for tr, te in splits:
        m = lgb.LGBMClassifier(
            n_estimators=300, learning_rate=0.05, num_leaves=31,
            random_state=RANDOM_STATE, verbose=-1,
        )
        m.fit(X[tr], y[tr])
        aucs.append(roc_auc_score(y[te], m.predict_proba(X[te])[:, 1]))
    return round(float(np.mean(aucs)), 4), round(float(np.std(aucs)), 4)


def evaluate(name: str, X_a: np.ndarray, X_ab: np.ndarray, y: np.ndarray) -> dict:
    skf = StratifiedKFold(n_splits=N_SPLITS, shuffle=True, random_state=RANDOM_STATE)
    splits = list(skf.split(X_a, y))

    rule = best_rule_auc(X_a, y, splits)
    d2, d2s = tree_auc(X_a, y, splits, 2)
    d3, d3s = tree_auc(X_a, y, splits, 3)
    lgb_a, lgb_a_s = lgb_auc(X_a, y, splits)
    lgb_ab, lgb_ab_s = lgb_auc(X_ab, y, splits)

    noise = max(lgb_ab_s, lgb_a_s, d2s)
    gain_order = round(lgb_ab - lgb_a, 4)
    gap_vs_rule = round(lgb_ab - rule, 4)
    return {
        "dgp": name,
        "base_rate": round(float(y.mean()), 4),
        "noise_floor_auc_std": noise,
        "rank_by_best_single_count_feature": rule,
        "tree_depth2_on_A": d2,
        "tree_depth3_on_A": d3,
        "lightgbm_on_A_counts_only": lgb_a,
        "lightgbm_on_A_plus_B_with_order": lgb_ab,
        "gain_from_ORDER (AB - A)": gain_order,
        "order_beats_noise": bool(gain_order > noise),
        "gap_model_vs_best_rule": gap_vs_rule,
        "model_beats_rule_beyond_noise": bool(gap_vs_rule > noise),
    }


def main() -> None:
    rng = np.random.default_rng(RANDOM_STATE)
    sessions = simulate_sessions(rng)
    X_a, X_b, names_a, names_b = extract_features(sessions)
    X_ab = np.hstack([X_a, X_b])

    # Nhãn gán trên CÙNG tập phiên -> khác biệt giữa 2 DGP thuần do hình dạng sự thật
    rng_a = np.random.default_rng(RANDOM_STATE + 1)
    rng_b = np.random.default_rng(RANDOM_STATE + 2)
    y_a = np.array([label_dgp_a(s, rng_a) for s in sessions])
    y_b = np.array([label_dgp_b(s, rng_b) for s in sessions])

    result = {
        "n_sessions": N_SESSIONS,
        "alphabet_size": len(ACTIONS),
        "n_features_A_counts": len(names_a),
        "n_features_B_bigrams": len(names_b),
        "results": [
            evaluate("A_rule_shaped (1 nguong tren 1 dem)", X_a, X_ab, y_a),
            evaluate("B_interaction_and_order_shaped", X_a, X_ab, y_b),
        ],
    }

    # Thí nghiệm chỉ CÓ GIÁ TRỊ nếu có tính phân biệt: rule đủ ở A, rule thất bại ở B.
    ra, rb = result["results"]
    result["verdict"] = {
        "A_rule_is_sufficient": not ra["model_beats_rule_beyond_noise"],
        "B_rule_structurally_fails": rb["model_beats_rule_beyond_noise"],
        "B_gain_comes_from_order": rb["order_beats_noise"],
        "experiment_is_discriminating": bool(
            (not ra["model_beats_rule_beyond_noise"]) and rb["model_beats_rule_beyond_noise"]
        ),
        "note": (
            "experiment_is_discriminating=False => harness/thiet ke sai, KHONG duoc dung ket qua. "
            "True => da xac dinh duoc DIEU KIEN khi nao rule that bai, khong phai 'AI luon tot hon'."
        ),
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))
    with open("/tmp/synthetic_dgp_result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
