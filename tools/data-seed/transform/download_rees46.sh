#!/usr/bin/env bash
# Tải các tháng REES46 đa ngành (data.rees46.com) bằng NHIỀU KẾT NỐI SONG SONG: server giới hạn tốc độ theo từng kết nối
# (1 kết nối có lúc chỉ ~90 KB/s, 3 kết nối song song ~7,6 MB/s — đo 2026-10-02). Mỗi file chia N đoạn theo byte (HTTP Range),
# mỗi đoạn tự tải tiếp khi đứt, ghép lại rồi kiểm tra gzip.
#   bash download_rees46.sh 2020-Feb 2020-Mar 2020-Apr
set -u
DIR="${OUT_DIR:-/d/JAVA/Graduation-Project/data/external/rees46-multi-full}"
BASE="https://data.rees46.com/datasets/marketplace"
N="${SEGMENTS:-8}"
mkdir -p "$DIR"

fetch_segment() {  # url part_file start end
  local url=$1 part=$2 start=$3 end=$4 want=$(( $4 - $3 + 1 )) have
  for attempt in $(seq 1 400); do
    have=$( [ -f "$part" ] && stat -c %s "$part" || echo 0 )
    [ "$have" -ge "$want" ] && return 0
    # kết nối bị bóp (< 300 KB/s trong 20 s) → cắt, mở kết nối mới tải tiếp (server thường cấp làn nhanh cho kết nối mới)
    curl -s --max-time 1800 --speed-limit 300000 --speed-time 20 -r $(( start + have ))-"$end" "$url" >> "$part" || sleep 1
  done
  have=$( [ -f "$part" ] && stat -c %s "$part" || echo 0 )
  [ "$have" -ge "$want" ]
}

for m in "$@"; do
  url="$BASE/$m.csv.gz"; out="$DIR/$m.csv.gz"
  size=$(curl -sSI --max-time 60 "$url" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}' | tail -1)
  if [ -f "$out" ] && [ "$(stat -c %s "$out")" = "$size" ] && gzip -t "$out" 2>/dev/null; then echo "$m: đã có, bỏ qua"; continue; fi
  rm -f "$out"
  seg=$(( (size + N - 1) / N ))
  echo "$m: $size byte, $N đoạn — bắt đầu $(date +%H:%M:%S)"
  pids=()
  for k in $(seq 0 $(( N - 1 ))); do
    s=$(( k * seg )); e=$(( s + seg - 1 )); [ $e -ge $size ] && e=$(( size - 1 ))
    fetch_segment "$url" "$out.part$k" $s $e & pids+=($!)
  done
  ok=1; for p in "${pids[@]}"; do wait "$p" || ok=0; done
  if [ $ok -ne 1 ]; then echo "$m: CÓ ĐOẠN LỖI — giữ .part để chạy lại"; continue; fi
  for k in $(seq 0 $(( N - 1 ))); do cat "$out.part$k"; done > "$out"
  if [ "$(stat -c %s "$out")" = "$size" ] && gzip -t "$out"; then
    rm -f "$out".part*; echo "$m: GZIP OK $(date +%H:%M:%S)"
  else
    echo "$m: HỎNG sau khi ghép (giữ .part)"; rm -f "$out"
  fi
done
