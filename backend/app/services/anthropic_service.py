"""
Anthropic Claude 서비스.

지원 모델: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001
임베딩: Anthropic은 임베딩 API 미지원 → AetherError 발생 (RAG는 Ollama 전용)
"""
from typing import AsyncIterator, List, Optional

from loguru import logger

from app.core.config import settings
from app.core.exceptions import AetherError
from app.models.generation import Message
from app.services.llm_provider import LLMProvider


class AnthropicService(LLMProvider):
    """Anthropic Claude API 구현체."""

    def __init__(self) -> None:
        try:
            from anthropic import AsyncAnthropic
        except ImportError as exc:
            raise RuntimeError(
                "anthropic 패키지가 설치되지 않았습니다. pip install anthropic"
            ) from exc

        self._client = AsyncAnthropic(
            api_key=settings.anthropic_api_key.get_secret_value(),
        )
        self.default_model = settings.anthropic_model
        self.timeout = settings.anthropic_timeout

    def _split_messages(
        self, messages: List[Message], system: Optional[str]
    ) -> tuple[Optional[str], List[dict]]:
        """Anthropic API는 system을 별도 파라미터로 받습니다."""
        # messages 내 "system" role이 있을 경우 추출
        sys_content: Optional[str] = system
        user_msgs: List[dict] = []

        for m in messages:
            if m.role == "system":
                sys_content = (sys_content + "\n" + m.content) if sys_content else m.content
            else:
                user_msgs.append({"role": m.role, "content": m.content})

        return sys_content, user_msgs

    async def generate(
        self,
        messages: List[Message],
        system: Optional[str] = None,
        max_tokens: int = 2048,
        model: Optional[str] = None,
    ) -> str:
        sys_content, user_msgs = self._split_messages(messages, system)

        try:
            kwargs = dict(
                model=model or self.default_model,
                max_tokens=max_tokens,
                messages=user_msgs,
            )
            if sys_content:
                kwargs["system"] = sys_content

            resp = await self._client.messages.create(**kwargs)
            return resp.content[0].text
        except Exception as exc:
            logger.error(f"[anthropic] generate 실패: {exc}")
            raise AetherError(
                "ANTHROPIC_ERROR",
                "Anthropic Claude 서비스 오류가 발생했습니다.",
                str(exc),
                502,
            ) from exc

    async def generate_stream(
        self,
        messages: List[Message],
        system: Optional[str] = None,
        max_tokens: int = 2048,
        model: Optional[str] = None,
    ) -> AsyncIterator[str]:
        sys_content, user_msgs = self._split_messages(messages, system)

        try:
            kwargs = dict(
                model=model or self.default_model,
                max_tokens=max_tokens,
                messages=user_msgs,
            )
            if sys_content:
                kwargs["system"] = sys_content

            async with self._client.messages.stream(**kwargs) as stream:
                async for token in stream.text_stream:
                    yield token
        except Exception as exc:
            logger.error(f"[anthropic] stream 실패: {exc}")
            raise AetherError(
                "ANTHROPIC_ERROR",
                "Anthropic Claude 스트리밍 오류가 발생했습니다.",
                str(exc),
                502,
            ) from exc

    async def embed(self, text: str) -> List[float]:
        raise AetherError(
            "ANTHROPIC_EMBED_NOT_SUPPORTED",
            "Anthropic은 임베딩 API를 지원하지 않습니다. RAG에는 Ollama를 사용하세요.",
            None,
            501,
        )
