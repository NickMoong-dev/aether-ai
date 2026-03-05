import json
from typing import AsyncIterator, List, Optional

import httpx
from loguru import logger

from app.core.config import settings
from app.core.exceptions import AetherError
from app.models.generation import Message
from app.services.llm_provider import LLMProvider


class OllamaService(LLMProvider):
    """Ollama 기반 LLM 구현체."""

    def __init__(self) -> None:
        self.base_url = settings.ollama_base_url
        self.default_model = settings.ollama_model
        self.timeout = settings.ollama_timeout
        self.max_retries = settings.ollama_max_retries

    def _build_messages(
        self, messages: List[Message], system: Optional[str]
    ) -> List[dict]:
        result: List[dict] = []
        if system:
            result.append({"role": "system", "content": system})
        result.extend({"role": m.role, "content": m.content} for m in messages)
        return result

    async def generate(
        self,
        messages: List[Message],
        system: Optional[str] = None,
        max_tokens: int = 2048,
        model: Optional[str] = None,
    ) -> str:
        payload = {
            "model": model or self.default_model,
            "messages": self._build_messages(messages, system),
            "stream": False,
            "options": {"num_predict": max_tokens},
        }

        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.post(
                        f"{self.base_url}/api/chat", json=payload
                    )
                    resp.raise_for_status()
                    return resp.json()["message"]["content"]
            except httpx.TimeoutException as exc:
                if attempt == self.max_retries:
                    raise AetherError(
                        "LLM_TIMEOUT", "AI 응답 시간이 초과되었습니다.", str(exc), 504
                    ) from exc
                logger.warning(f"Ollama timeout, 재시도 {attempt + 1}/{self.max_retries}")
            except httpx.HTTPStatusError as exc:
                raise AetherError(
                    "LLM_ERROR", "AI 서비스 오류가 발생했습니다.", str(exc), 502
                ) from exc
            except Exception as exc:
                if attempt == self.max_retries:
                    raise AetherError(
                        "LLM_UNAVAILABLE",
                        "AI 서비스에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요.",
                        str(exc),
                        503,
                    ) from exc
                logger.warning(f"Ollama 오류, 재시도 {attempt + 1}/{self.max_retries}: {exc}")

        raise AetherError("LLM_UNAVAILABLE", "AI 서비스에 연결할 수 없습니다.", None, 503)

    async def generate_stream(
        self,
        messages: List[Message],
        system: Optional[str] = None,
        max_tokens: int = 2048,
        model: Optional[str] = None,
    ) -> AsyncIterator[str]:
        payload = {
            "model": model or self.default_model,
            "messages": self._build_messages(messages, system),
            "stream": True,
            "options": {"num_predict": max_tokens},
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/api/chat", json=payload
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            if not data.get("done") and "message" in data:
                                yield data["message"]["content"]
                        except json.JSONDecodeError:
                            pass
        except httpx.HTTPStatusError as exc:
            raise AetherError(
                "LLM_ERROR", "AI 서비스 오류가 발생했습니다.", str(exc), 502
            ) from exc
        except Exception as exc:
            raise AetherError(
                "LLM_UNAVAILABLE",
                "AI 서비스에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요.",
                str(exc),
                503,
            ) from exc

    async def embed(self, text: str) -> List[float]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": settings.ollama_embed_model, "prompt": text},
                )
                resp.raise_for_status()
                return resp.json()["embedding"]
        except Exception as exc:
            raise AetherError(
                "EMBED_ERROR", "임베딩 생성에 실패했습니다.", str(exc), 503
            ) from exc
