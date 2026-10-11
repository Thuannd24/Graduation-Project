from typing import Any, Optional

from pydantic import BaseModel


class ApiResponse(BaseModel):
    """
    Envelope chuẩn của hệ thống — khớp ApiResponse của các service Java ({code, message, data}).
    FE apiClient thấy code == "SUCCESS" sẽ tự bóc lớp .data.
    """
    code: str = "SUCCESS"
    message: str = "Success"
    data: Optional[Any] = None


def success(data: Any = None, message: str = "Success") -> ApiResponse:
    return ApiResponse(code="SUCCESS", message=message, data=data)
