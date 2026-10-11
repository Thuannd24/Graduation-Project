#!/usr/bin/env bash
# Chay run_platform_multiseed.sh TACH KHOI phien Claude (job ~1 gio vuot gioi han 10 phut cua lenh
# nen; phien lam viec cung da bi ngat giua chung nhieu lan). Nhung SAN watchdog RAM ben trong de may
# van duoc bao ve ke ca khi phien Claude ket thuc -- khong phu thuoc vao Monitor cua Claude.
set -u
EXP_DIR="D:/JAVA/Graduation-Project/AI/forecast-service/app/training/experiments"
OUT_DIR="${OUT_DIR:-D:/JAVA/Graduation-Project/data/experiment-results/platform_sasrec}"
LOG="$OUT_DIR/driver.log"
RAM_KILL_GB="${RAM_KILL_GB:-1.5}"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/.done"

training_pids() {
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -like '*recsys_platform_sasrec*' } | ForEach-Object { \$_.ProcessId }" 2>/dev/null | tr -d '\r'
}

# --- Watchdog RAM: moi 5 giay, RAM trong < nguong -> kill DUNG tien trinh train (khong kill python khac)
(
  while [ ! -f "$OUT_DIR/.done" ]; do
    ram=$(powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,2)" 2>/dev/null | tr -d '\r')
    if [ -n "$ram" ] && awk -v r="$ram" -v t="$RAM_KILL_GB" 'BEGIN{exit !(r<t)}'; then
      for p in $(training_pids); do
        powershell -NoProfile -Command "Stop-Process -Id $p -Force" 2>/dev/null
      done
      echo "WATCHDOG $(date '+%F %T') RAM ${ram}GB < ${RAM_KILL_GB}GB -> da KILL tien trinh train" >> "$LOG"
    fi
    sleep 5
  done
) &
WD=$!

echo "DETACHED START $(date '+%F %T')" >> "$LOG"
# Cho seed dang chay do (neu co) ket thuc truoc -- tranh 2 lan train song song gap doi RAM.
while [ -n "$(training_pids)" ]; do sleep 10; done
echo "Khong con tien trinh train cu, bat dau vong seed" >> "$LOG"

bash "$EXP_DIR/run_platform_multiseed.sh" >> "$LOG" 2>&1
echo "DETACHED END $(date '+%F %T') rc=$?" >> "$LOG"
touch "$OUT_DIR/.done"
kill "$WD" 2>/dev/null
