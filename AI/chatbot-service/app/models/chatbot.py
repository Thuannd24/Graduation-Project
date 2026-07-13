from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class ChatRequest(BaseModel):
    sessionId: str = Field(..., validation_alias="session_id")
    userId: Optional[int] = Field(None, validation_alias="user_id")
    message: str
    attachments: Optional[List[str]] = None

    class Config:
        populate_by_name = True

class ChatMessageResponse(BaseModel):
    id: Optional[int] = None
    sessionId: str
    role: str
    content: str
    intent: Optional[str] = None
    sentiment: Optional[str] = None
    sentimentScore: Optional[float] = None
    retrievedItems: Optional[List[Dict[str, Any]]] = None
    createdAt: str

class EscalationRequest(BaseModel):
    sessionId: str = Field(..., validation_alias="session_id")
    reason: Optional[str] = None

    class Config:
        populate_by_name = True
