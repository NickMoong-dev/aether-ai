"""
OpenAI 호환 LLM 서비스.

OpenAI API 외에도 base_url을 변경하는 것만으로
아래 서비스를 모두 지원합니다:
  - RunPod    : https://api.runpod.ai/v2/{endpoint_id}/openai
  - Modal     : https://{workspace}--{app}.modal.run/v1
  - Together.ai: https://api.together.xyz/v1
  - Groq      : https://api.groq.com/openai/v1
  - Replicate : https://openai-compat.replicate.com/v1
  - 자체 vLLM  : http://your-server:8000/v1
"""
from typing import AsyncIterator, List, Optional

from loguru import logger

from app.core.config import settings
from app.core.exceptions import AetherError
from app.models.generation import Message
from app.services.llm_provider import LLMProvider


class OpenAICompatService(LLMProvider):
    """OpenAI 및 OpenAI 호환 엔드포인트 구현체."""

    def __init__(
        self,
        api_key: str,
        base_url: str,
        default_model: str,
        timeout: int,
        provider_name: str = "openai",
    ) -> None:
        try:
            from openai import AsyncOpenAI
        except ImportError as exc:
            raise RuntimeError(
                "openai 패키지가 설치되지 않았습니다. pip install openai"
            ) from exc

        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
        )
        self.default_model = default_model
        self.provider_name = provider_name

    async def generate(
        self,
        messages: List[Message],
        system: Optional[str] = None,
        max_tokens: int = 2048,
        model: Optional[str] = None,
    ) -> str:
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.extend({"role": m.role, "content": m.content} for m in messages)

        try:
            resp = await self._client.chat.completions.create(
                model=model or self.default_model,
                messages=msgs,
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content or ""
        except Exception as exc:
            logger.error(f"[{self.provider_name}] generate 실패: {exc}")
            raise AetherError(
                f"{self.provider_name.upper()}_ERROR",
                f"{self.provider_name} 서비스 오류가 발생했습니다.",
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
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.extend({"role": m.role, "content": m.content} for m in messages)

        try:
            async with self._client.chat.completions.stream(
                model=model or self.default_model,
                messages=msgs,
                max_tokens=max_tokens,
            ) as stream:
                async for chunk in stream:
                    token = chunk.choices[0].delta.content
                    if token:
                        yield token
        except Exception as exc:
            logger.error(f"[{self.provider_name}] stream 실패: {exc}")
            raise AetherError(
                f"{self.provider_name.upper()}_ERROR",
                f"{self.provider_name} 스트리밍 오류가 발생했습니다.",
                str(exc),
                502,
            ) from exc

    async def embed(self, text: str) -> List[float]:
        """OpenAI 임베딩 (text-embedding-3-small)."""
        try:
            resp = await self._client.embeddings.create(
                model="text-embedding-3-small",
                input=text,
            )
            return resp.data[0].embedding
        except Exception as exc:
            raise AetherError(
                f"{self.provider_name.upper()}_EMBED_ERROR",
                "임베딩 생성에 실패했습니다.",
                str(exc),
                503,
            ) from exc


def make_openai_service() -> OpenAICompatService:
    """OpenAI 서비스 인스턴스 생성."""
    return OpenAICompatService(
        api_key=settings.openai_api_key.get_secret_value(),
        base_url=settings.openai_base_url,
        default_model=settings.openai_model,
        timeout=settings.openai_timeout,
        provider_name="openai",
    )


def make_cloud_gpu_service() -> OpenAICompatService:
    """클라우드 GPU 서비스 인스턴스 생성 (RunPod / Modal / Together.ai 등)."""
    return OpenAICompatService(
        api_key=settings.cloud_gpu_api_key.get_secret_value(),
        base_url=settings.cloud_gpu_base_url,
        default_model=settings.cloud_gpu_model,
        timeout=settings.cloud_gpu_timeout,
        provider_name="cloud_gpu",
    )
