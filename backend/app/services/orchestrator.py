"""
LLM 오케스트레이터.

프로바이더 선택 및 자동 폴백을 담당합니다.

폴백 동작 (auto_fallback=True):
  요청 프로바이더 실패 → fallback_order 순서대로 다음 가용 프로바이더 시도

임베딩은 항상 Ollama를 사용합니다 (RAG 일관성 보장).
Ollama가 불가할 경우 OpenAI 임베딩으로 폴백합니다.
"""
from typing import AsyncIterator, List, Optional

from loguru import logger

from app.core.config import settings
from app.core.exceptions import AetherError
from app.models.generation import Message
from app.services.llm_provider import LLMProvider
from app.services.ollama_service import OllamaService


class LLMOrchestrator:
    def __init__(self) -> None:
        # 로컬 Ollama는 항상 초기화
        self._ollama = OllamaService()

        # 클라우드 프로바이더는 지연 초기화 (설정 없으면 None)
        self._openai: Optional[LLMProvider] = None
        self._anthropic: Optional[LLMProvider] = None
        self._cloud_gpu: Optional[LLMProvider] = None

        if settings.is_openai_configured():
            from app.services.openai_compat_service import make_openai_service
            self._openai = make_openai_service()
            logger.info("OpenAI 프로바이더 활성화")

        if settings.is_anthropic_configured():
            from app.services.anthropic_service import AnthropicService
            self._anthropic = AnthropicService()
            logger.info("Anthropic 프로바이더 활성화")

        if settings.is_cloud_gpu_configured():
            from app.services.openai_compat_service import make_cloud_gpu_service
            self._cloud_gpu = make_cloud_gpu_service()
            logger.info(f"클라우드 GPU 프로바이더 활성화: {settings.cloud_gpu_base_url}")

    # ── 프로바이더 조회 ──────────────────────────────────────────────

    def _get_provider(self, name: str) -> LLMProvider:
        provider_map = {
            "ollama": self._ollama,
            "openai": self._openai,
            "anthropic": self._anthropic,
            "cloud_gpu": self._cloud_gpu,
        }
        provider = provider_map.get(name)
        if provider is None:
            raise AetherError(
                "PROVIDER_NOT_CONFIGURED",
                f"'{name}' 프로바이더가 설정되지 않았습니다. .env 파일을 확인하세요.",
                None,
                503,
            )
        return provider

    def available_providers(self) -> List[str]:
        """현재 사용 가능한 프로바이더 목록."""
        result = ["ollama"]
        if self._openai:
            result.append("openai")
        if self._anthropic:
            result.append("anthropic")
        if self._cloud_gpu:
            result.append("cloud_gpu")
        return result

    def _resolve_provider_name(self, requested: Optional[str]) -> str:
        """요청된 프로바이더 이름을 최종 결정합니다."""
        name = requested or settings.default_provider
        if name == "auto":
            # 폴백 순서에서 첫 번째 가용 프로바이더 선택
            available = self.available_providers()
            for candidate in settings.fallback_order:
                if candidate in available:
                    return candidate
            return "ollama"
        return name

    # ── 폴백 체인 ────────────────────────────────────────────────────

    def _fallback_chain(self, primary: str) -> List[str]:
        """primary 실패 시 시도할 프로바이더 순서."""
        if not settings.auto_fallback:
            return []
        available = self.available_providers()
        chain = [p for p in settings.fallback_order if p in available and p != primary]
        return chain

    # ── 공개 API ─────────────────────────────────────────────────────

    async def generate(
        self,
        messages: List[Message],
        system: Optional[str] = None,
        max_tokens: int = 2048,
        model: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> tuple[str, str]:
        """텍스트 생성. (응답 텍스트, 사용된 프로바이더 이름) 반환."""
        primary = self._resolve_provider_name(provider)
        chain = [primary] + self._fallback_chain(primary)

        last_exc: Optional[Exception] = None
        for name in chain:
            try:
                svc = self._get_provider(name)
                text = await svc.generate(messages, system, max_tokens, model)
                if name != primary:
                    logger.warning(f"폴백 사용: {primary} → {name}")
                return text, name
            except AetherError as exc:
                last_exc = exc
                logger.warning(f"[{name}] 실패 ({exc.code}), 다음 프로바이더 시도...")
            except Exception as exc:
                last_exc = exc
                logger.warning(f"[{name}] 예상치 못한 오류: {exc}")

        raise AetherError(
            "ALL_PROVIDERS_FAILED",
            "모든 AI 프로바이더 호출에 실패했습니다.",
            str(last_exc),
            503,
        )

    async def generate_stream(
        self,
        messages: List[Message],
        system: Optional[str] = None,
        max_tokens: int = 2048,
        model: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> tuple[AsyncIterator[str], str]:
        """스트리밍 생성. (AsyncIterator, 사용된 프로바이더 이름) 반환.
        스트리밍은 폴백 없이 지정 프로바이더만 사용합니다 (중간 전환 불가).
        """
        name = self._resolve_provider_name(provider)
        svc = self._get_provider(name)
        return svc.generate_stream(messages, system, max_tokens, model), name

    async def embed(self, text: str) -> List[float]:
        """임베딩 벡터 생성. Ollama 우선, 실패 시 OpenAI로 폴백."""
        try:
            return await self._ollama.embed(text)
        except AetherError:
            if self._openai:
                logger.warning("Ollama 임베딩 실패 → OpenAI 임베딩으로 폴백")
                return await self._openai.embed(text)
            raise


# 앱 전역 싱글톤
orchestrator = LLMOrchestrator()
