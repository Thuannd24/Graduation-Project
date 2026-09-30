#!/usr/bin/env bash
# Train platform_v1 SASRec voi nhieu seed, roi tinh bootstrap CI (paired SASRec vs Recency).
# RESUMABLE: seed nao da co file ket qua thi bo qua -- phien lam viec bi ngat giua chung (da xay ra
# nhieu lan) khong lam mat cac seed da xong. Ket qua luu vao data/ (gitignore, KHONG phai scratchpad
# tam cua Claude -- scratchpad da tung bi don sach sau vai ngay, mat het ket qua).
#
# Chay duoc ca Windows (Git Bash, may dev) lan Linux (may GPU thue) — duong dan lay theo vi tri
# script, khong ghi cung. Tren may GPU:
#   EVENTS_CSV=/root/data/v1_20000u/user_events.csv OUT_DIR=/root/results \
#   BATCH_SIZE=512 MAXLEN=50 D_MODEL=64 bash run_platform_multiseed.sh
# (bien moi truong EVENTS_CSV/BATCH_SIZE/... truyen thang xuong recsys_platform_sasrec.py)
set -u
EXP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$EXP_DIR/../../../../.." && pwd)"
if [ -z "${PY:-}" ]; then
  if [ -x "D:/ai_venv/Scripts/python.exe" ]; then PY="D:/ai_venv/Scripts/python.exe"; else PY="python3"; fi
fi
OUT_DIR="${OUT_DIR:-$REPO_DIR/data/experiment-results/platform_sasrec}"
SEEDS="${SEEDS:-42 123 7}"
mkdir -p "$OUT_DIR"
export PYTHONIOENCODING=utf-8

for s in $SEEDS; do
  if [ -f "$OUT_DIR/seed${s}.json" ]; then
    echo "SKIP seed=$s (da co ket qua)"
    continue
  fi
  echo "START seed=$s"
  SEED="$s" \
  PLATFORM_SASREC_RESULT_PATH="$OUT_DIR/seed${s}.json" \
  PLATFORM_SASREC_MODEL_PATH="$OUT_DIR/seed${s}.pt" \
    "$PY" -u "$EXP_DIR/recsys_platform_sasrec.py" > "$OUT_DIR/seed${s}.log" 2>&1
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "FAILED seed=$s rc=$rc (xem $OUT_DIR/seed${s}.log)"
    exit $rc
  fi
  echo "DONE seed=$s $(grep -E 'SASRec \(platform_v1' "$OUT_DIR/seed${s}.log")"
done

echo "BOOTSTRAP"
RESULTS_DIR="$OUT_DIR" "$PY" "$EXP_DIR/recsys_platform_bootstrap_ci.py" > "$OUT_DIR/bootstrap.log" 2>&1
echo "ALL DONE rc=$?"
