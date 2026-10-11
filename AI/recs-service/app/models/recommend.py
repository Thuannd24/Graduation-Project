from pydantic import BaseModel, field_validator
from typing import List, Optional, Union

class RecommendRequest(BaseModel):
    # user id thật là Keycloak UUID (chuỗi) — trước đây khai `int` nên mọi user thật bị 422.
    # Vẫn nhận số nguyên cho client cũ, chuẩn hoá về chuỗi để khớp key Redis `user:{id}:history`.
    userId: Optional[Union[str, int]] = None
    sessionId: str
    top_k: int = 10

    @field_validator("userId")
    @classmethod
    def _user_id_as_str(cls, v):
        return str(v) if v is not None else None

class RecommendedItem(BaseModel):
    id: str
    name: str
    price: float
    score: float
    # Trường hiển thị cho ProductCard (FE) — optional để không vỡ client cũ
    oldPrice: Optional[float] = None
    image: Optional[str] = None
    slug: Optional[str] = None
    rating: Optional[float] = None

class RecommendResponse(BaseModel):
    strategy: str  # sasrec / recency / popularity
    items: List[RecommendedItem]
