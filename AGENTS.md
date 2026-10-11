# AGENTS.md

> Bản đầy đủ về cách làm việc trên repo này (cho agent không tự nạp CLAUDE.md, vd Codex).
> Claude Code dùng CLAUDE.md (đã tóm tắt sẵn). Nội dung hai file thống nhất nhau.

## Chọn tool (rẻ nhất toàn cục)

- Task tầm thường, 1–3 file đã biết rõ → đọc trực tiếp.
- Chưa biết code ở đâu → grep/search trước, rồi đọc file liên quan.
- Task có nhiều lớp controller/service/repository/cache, performance/high-load/DB write, hoặc cần phân tích rủi ro → đọc `.agent/tools.yml` và cân nhắc pack context theo scope nhỏ nhất.
- Nếu sau search thấy hơn 5 file liên quan, hoặc đã đi qua 3 lớp kiến trúc, chuyển sang `.agent/scripts/pack-context.ps1 -Path <scope>`.
- Đừng pack cả repo khi có thể pack module/thư mục nhỏ hơn.
- Mục tiêu là rẻ nhất toàn cục: một context pack scoped nhỏ có thể rẻ và chính xác hơn nhiều lần đọc rải rác.

## Sau khi sửa code

1. Vòng lặp nhanh: `.agent/scripts/agent-check.ps1 -Fast`.
2. Trước khi báo xong: `.agent/scripts/agent-check.ps1` (full).
3. Trước khi kết thúc: `.agent/scripts/review-diff.ps1` và tóm tắt thay đổi.

## Lằn ranh đỏ

- Hỏi trước: commit, push, xóa file, cài package global, đổi migration/CI/security,
  sửa file ngoài phạm vi task. (Quyền đầy đủ: `.agent/policy.yml`.)
- Không bao giờ: `git reset --hard`, `git clean -f`, `git push --force`, `rm -rf`.
- Giữ public API; thay đổi nhỏ, dễ review; không đụng file không liên quan.

<!-- PRESET-RULES:START -->
## Preset rules (generic)

- Make the smallest reviewable change.
- Do not modify unrelated files.
- Preserve public APIs unless explicitly requested.
- Ask before commit, push, delete, or installing anything globally.

<!-- PRESET-RULES:END -->
