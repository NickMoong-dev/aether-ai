from typing import List, Literal, Optional
from pydantic import BaseModel


class Message(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str


class GenerateRequest(BaseModel):
    messages: List[Message]
    system: Optional[str] = None
    max_tokens: int = 2048
    model: Optional[str] = None
    # "ollama" | "openai" | "anthropic" | "cloud_gpu" | "auto" | None(기본값 사용)
    provider: Optional[str] = None


class GenerateResponse(BaseModel):
    success: bool = True
    text: str
    model: str
    provider: str  # 실제로 사용된 프로바이더
