"""Dựng notebook Colab train SASRec từ 1 tập train do `node tools/data-seed/seed.mjs --out <dir>` xuất ra.

Máy Colab không thấy file local → NHÚNG dữ liệu vào notebook: chỉ chuỗi VIEW/CART đã lọc + sắp theo (user, thời
gian) — mảng (số lượt/user, item_id) nén xz (20K user ≈ 14MB). Notebook tái dựng lại đúng định dạng
user_events.csv mà recsys_platform_sasrec.py đọc (đã kiểm: giải nén giống hệt bản gốc).

    python build_colab_notebook.py <dir tập train> --out colab_train_overnight.ipynb [--budget-h 4] [--seeds 42,123,7]
    python build_colab_notebook.py <dir tập train> --out colab_train_smoke.ipynb --users 2000 --smoke

Cần cache `<dir>/user_events.csv.viewcart.v2.pkl` — tạo bằng 1 lần chạy recsys_platform_sasrec.py với
EVENTS_CSV=<dir>/user_events.csv (hoặc để script này tự tạo qua load_user_seqs_from_csv).
"""
from __future__ import annotations

import argparse
import base64
import importlib.util
import json
import lzma
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def load_sasrec_module():
    spec = importlib.util.spec_from_file_location("sasrec", os.path.join(HERE, "recsys_platform_sasrec.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def encode_sequences(user_seqs: dict[str, list[int]], max_users: int | None) -> tuple[str, int, int]:
    users = sorted(user_seqs)[:max_users] if max_users else sorted(user_seqs)
    counts = np.array([len(user_seqs[u]) for u in users], dtype=np.int32)
    items = np.concatenate([np.asarray(user_seqs[u], dtype=np.int32) for u in users])
    raw = counts.tobytes() + items.tobytes()
    b64 = base64.b64encode(lzma.compress(raw, preset=9 | lzma.PRESET_EXTREME)).decode()
    # tự kiểm: giải nén phải ra đúng
    back = lzma.decompress(base64.b64decode(b64))
    assert np.array_equal(np.frombuffer(back[: len(users) * 4], dtype=np.int32), counts)
    assert np.array_equal(np.frombuffer(back[len(users) * 4:], dtype=np.int32), items)
    return b64, len(users), int(len(items))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("train_dir")
    ap.add_argument("--out", required=True)
    ap.add_argument("--users", type=int, default=None, help="chỉ nhúng N user đầu (notebook nhỏ)")
    ap.add_argument("--smoke", action="store_true", help="5 epoch 1 seed, không bootstrap")
    ap.add_argument("--budget-h", type=float, default=4.0, help="ngân sách giờ Colab miễn phí (trần ~5h)")
    ap.add_argument("--seeds", default="42,123,7")
    a = ap.parse_args()

    mod = load_sasrec_module()
    user_seqs, n_rows = mod.load_user_seqs_from_csv(os.path.join(a.train_dir, "user_events.csv"))
    b64, n_users, n_items = encode_sequences(user_seqs, a.users)
    manifest_path = os.path.join(a.train_dir, "manifest.json")
    manifest = json.load(open(manifest_path, encoding="utf-8")) if os.path.exists(manifest_path) else {}
    script = open(os.path.join(HERE, "recsys_platform_sasrec.py"), encoding="utf-8").read()
    boot = open(os.path.join(HERE, "recsys_platform_bootstrap_ci.py"), encoding="utf-8").read()
    bench = "".join(json.load(open(os.path.join(HERE, "colab_env_check.ipynb"), encoding="utf-8"))["cells"][3]["source"])

    cells = []
    md = lambda s: cells.append({"cell_type": "markdown", "metadata": {}, "source": s.strip("\n").splitlines(True)})
    code = lambda s: cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s.strip("\n").splitlines(True)})

    md(f"""
# Train SASRec trên Colab GPU — {'chạy thử nhỏ' if a.smoke else 'chạy chính thức'}

Tập train: `{os.path.basename(os.path.normpath(a.train_dir))}` — {n_users:,} user, {n_items:,} lượt xem/thêm giỏ
(catalog: {manifest.get('catalog', {}).get('products', '?')} SP; sinh lúc {manifest.get('generatedAt', '?')}; fidelity
{'đạt hết' if manifest.get('fidelity', {}).get('allPass') else 'xem manifest'}).

**Cách chạy (VS Code + extension Colab):** Select Kernel → Colab → New Colab Server → **GPU T4** → **Run All**.
Để VS Code mở + máy không ngủ; xong bấm **Ctrl+S** để lưu output vào file.
{'' if a.smoke else f'Tự chia thời gian: sau khi đo tốc độ, đặt số epoch/seed để các seed xong trong ~{a.budget_h}h (Colab miễn phí trần ~5h, hết giờ mất máy); không đủ giờ thì không bắt đầu seed mới.'}
""")
    code(f"""
import time
T0 = time.time()
BUDGET_H = {a.budget_h}
!nvidia-smi --query-gpu=name,memory.total --format=csv
import torch, pandas; print("torch", torch.__version__, "| pandas", pandas.__version__, "| CUDA:", torch.cuda.is_available())
assert torch.cuda.is_available(), "Chưa chọn GPU — Runtime phải là GPU T4"
""")
    code("%%writefile /content/recsys_platform_sasrec.py\n" + script)
    code("%%writefile /content/recsys_platform_bootstrap_ci.py\n" + boot)
    code(f'''
import base64, lzma, numpy as np, pandas as pd, os
raw = lzma.decompress(base64.b64decode("{b64}"))
N_USERS = {n_users}
counts = np.frombuffer(raw[:N_USERS * 4], dtype=np.int32)
items = np.frombuffer(raw[N_USERS * 4:], dtype=np.int32)
assert counts.sum() == len(items) == {n_items}
users = np.repeat(np.array([f"u{{i+1:06d}}" for i in range(N_USERS)]), counts)
ts = (pd.Timestamp("2026-01-01", tz="UTC") + pd.to_timedelta(np.arange(len(items)), unit="s")).strftime("%Y-%m-%dT%H:%M:%SZ")
os.makedirs("/content/data", exist_ok=True)
pd.DataFrame({{"user_id": users, "item_id": items, "action_type": "VIEW_PRODUCT", "created_at": ts}}).to_csv("/content/data/user_events.csv", index=False)
print(f"OK: {{len(items):,}} dòng, {{N_USERS:,}} user")
''')
    md("### Đo tốc độ ở đúng kích thước job")
    code(bench)
    seeds = [int(s) for s in a.seeds.split(",")]
    run_seeds = seeds[:1] if a.smoke else seeds
    code(f'''
import subprocess, json
OUT = "/content/results/scaled"; os.makedirs(OUT, exist_ok=True)
SMOKE = {a.smoke}
left_s = BUDGET_H * 3600 - (time.time() - T0)
EPOCHS = 5 if SMOKE else max(3, min(30, int(left_s / {len(run_seeds)} / (epoch_s * 1.15))))
SEED_S = EPOCHS * epoch_s * 1.15
print(f"{{EPOCHS}} epoch/seed (~{{SEED_S/60:.0f}} phút/seed, có dừng sớm)")
BASE = dict(EVENTS_CSV="/content/data/user_events.csv", N_EPOCHS=str(EPOCHS), BATCH_SIZE="512", MAXLEN="50",
            D_MODEL="64", LOG_EVERY="1", PYTHONUNBUFFERED="1", EMB_INIT="scaled")

def run_seed(seed, out_dir, **extra):
    res = f"{{out_dir}}/seed{{seed}}.json"
    if os.path.exists(res):
        print(f"BỎ QUA seed={{seed}} (đã có)"); return
    left = BUDGET_H * 3600 - (time.time() - T0)
    if not SMOKE and left < SEED_S:
        print(f"DỪNG: còn {{left/60:.0f}} phút < 1 seed — không bắt đầu seed={{seed}}"); return
    env = {{**os.environ, **BASE, **extra, "SEED": str(seed), "PLATFORM_SASREC_RESULT_PATH": res,
           "PLATFORM_SASREC_MODEL_PATH": f"{{out_dir}}/seed{{seed}}.pt"}}
    t = time.time(); print(f"===== START seed={{seed}} {{time.strftime('%H:%M:%S')}}", flush=True)
    p = subprocess.Popen(["python", "-u", "/content/recsys_platform_sasrec.py"], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in p.stdout:
        if not any(s in line for s in ("UserWarning", "_canonical_mask", "src_key_padding")):
            print(line, end="", flush=True)
    rc = p.wait(); print(f"===== END seed={{seed}} rc={{rc}} {{(time.time()-t)/60:.1f}} phút", flush=True)
    if rc != 0: raise SystemExit(f"seed {{seed}} lỗi rc={{rc}}")

for s in {run_seeds}:
    run_seed(s, OUT)
''')
    if not a.smoke:
        code('''
r = subprocess.run(["python", "/content/recsys_platform_bootstrap_ci.py"], env={**os.environ, "RESULTS_DIR": OUT}, capture_output=True, text=True)
print(r.stdout[-6000:], r.stderr[-2000:])
''')
    code('''
import glob
for f in sorted(glob.glob("/content/results/*/seed*.json")):
    d = json.load(open(f))
    print(os.path.relpath(f, "/content/results"), "| SASRec", d["sasrec"], "| Recency", d["recency_same_protocol"],
          "| Popularity", d["popularity_same_protocol"], "| thời gian", d.get("timing_s"))
print(f"Tổng thời gian phiên: {(time.time()-T0)/3600:.2f}h")
''')
    nb = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
          "language_info": {"name": "python"}, "accelerator": "GPU"}, "nbformat": 4, "nbformat_minor": 5}
    json.dump(nb, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{a.out}: {os.path.getsize(a.out)/1e6:.1f}MB, {n_users:,} user, {n_items:,} lượt (nguồn {n_rows:,} dòng VIEW/CART)")


if __name__ == "__main__":
    main()
