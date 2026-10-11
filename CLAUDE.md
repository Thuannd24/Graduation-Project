# CLAUDE.md

> File này được Claude Code tự nạp mỗi session. Nó **tự đủ** cho task thường gặp —
> không cần đọc thêm file nào. Chỉ tra `.agent/` khi thật sự cần (xem cuối file).

## Chọn tool (rẻ nhất toàn cục)

- Task tầm thường, 1–3 file đã biết rõ → **đọc trực tiếp**.
- Chưa biết code ở đâu → **grep/search** rồi đọc file liên quan.
- Task có nhiều lớp controller/service/repository/cache, performance/high-load/DB write, hoặc cần phân tích rủi ro → đọc `.agent/tools.yml` và cân nhắc pack context theo scope nhỏ nhất.
- Nếu sau search thấy hơn 5 file liên quan, hoặc đã đi qua 3 lớp kiến trúc, chuyển sang `.agent/scripts/pack-context.ps1 -Path <scope>`.
- **Đừng** pack cả repo khi có thể pack module/thư mục nhỏ hơn.
- Mục tiêu là rẻ nhất toàn cục: một context pack scoped nhỏ có thể rẻ và chính xác hơn nhiều lần đọc rải rác.

## Sau khi sửa code

- Vòng lặp nhanh: `.agent/scripts/agent-check.ps1 -Fast` (compile/lint).
- Trước khi báo xong: `.agent/scripts/agent-check.ps1` (full test).
- Trước khi kết thúc: `.agent/scripts/review-diff.ps1`.

## Lằn ranh đỏ

- **Hỏi trước**: commit, push, xóa file, cài package global, đổi migration/CI/security,
  hoặc sửa file ngoài phạm vi task.
- **Không bao giờ**: `git reset --hard`, `git clean -f`, `git push --force`, `rm -rf`.
  (Các lệnh này đã bị hook `.agent/scripts/guard-bash` chặn cứng.)
- Giữ public API; thay đổi nhỏ, dễ review.

---

Chi tiết khi cần (không cần đọc cho task thường): quyền đầy đủ ở `.agent/policy.yml`,
rule theo stack ở `.agent/preset.yml`, bản đầy đủ ở `AGENTS.md`.
