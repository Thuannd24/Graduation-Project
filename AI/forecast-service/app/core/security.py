"""Phân quyền ở tầng service cho các endpoint quản trị của forecast-service.

Danh tính đến từ api-gateway (UserHeaderFilter.java): gateway xác thực JWT, **xoá mọi header
`X-User-*` client tự gửi**, rồi inject `X-User-Id` và `X-User-Roles` (realm roles của Keycloak, ngăn
cách bởi dấu phẩy, có thể có hoặc không tiền tố `ROLE_`). Gateway chỉ chặn thô `/api/v1/admin/**`;
các route `/api/v1/models/**`, `/api/v1/risk/**`, `/api/v1/rfm/**` chỉ yêu cầu "đã đăng nhập", nên
trước đây khách hàng thường cũng gọi được huấn luyện model và quét rủi ro (thao tác PHÁT VOUCHER).
"""
from fastapi import Header, HTTPException

ADMIN_ROLE = "ADMIN"


def parse_roles(raw: str | None) -> set[str]:
    roles = set()
    for part in (raw or "").split(","):
        role = part.strip().upper()
        if role.startswith("ROLE_"):
            role = role[len("ROLE_"):]
        if role:
            roles.add(role)
    return roles


def require_admin(
    x_user_id: str | None = Header(None, alias="X-User-Id"),
    x_user_roles: str | None = Header(None, alias="X-User-Roles"),
) -> str:
    """Dependency: 401 khi chưa đăng nhập (không có X-User-Id), 403 khi không có role ADMIN."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Cần đăng nhập")
    if ADMIN_ROLE not in parse_roles(x_user_roles):
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên được thực hiện thao tác này")
    return x_user_id
