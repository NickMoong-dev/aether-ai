from abc import ABC, abstractmethod
from typing import AsyncIterator, List, Optional

from app.models.generation import Message


class LLMProvider(ABC):
    """LLM 추상 인터페이스 — 구현체를 교체 가능하게 설계."""

    @abstractmethod
    async def generate(
        self,
        messages: List[Message],
        system: Optional[str] = None,
        max_tokens: int = 2048,
        model: Optional[str] = None,
    ) -> str:
        """단일 응답 생성."""
        ...

    @abstractmethod
    async def generate_stream(
        self,
        messages: List[Message],
        system: Optional[str] = None,
        max_tokens: int = 2048,
        model: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """스트리밍 응답 생성 (토큰 단위 yield)."""
        ...

    @abstractmethod
    async def embed(self, text: str) -> List[float]:
        """텍스트 임베딩 벡터 생성."""
        ...
