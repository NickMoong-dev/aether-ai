from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import AetherError
from app.models.generation import Message
from app.services.orchestrator import LLMOrchestrator


def _make_orchestrator(openai=False, anthropic=False, cloud_gpu=False):
    """테스트용 오케스트레이터 생성 (클라우드 프로바이더 모킹)."""
    with (
        patch("app.services.orchestrator.settings") as mock_cfg,
        patch("app.services.orchestrator.OllamaService") as mock_ollama_cls,
    ):
        mock_cfg.is_openai_configured.return_value = openai
        mock_cfg.is_anthropic_configured.return_value = anthropic
        mock_cfg.is_cloud_gpu_configured.return_value = cloud_gpu
        mock_cfg.default_provider = "ollama"
        mock_cfg.auto_fallback = True
        mock_cfg.fallback_order = ["ollama", "cloud_gpu", "openai", "anthropic"]
        mock_cfg.cloud_gpu_base_url = "http://test-gpu"

        orch = LLMOrchestrator.__new__(LLMOrchestrator)
        orch._ollama = AsyncMock()
        orch._openai = AsyncMock() if openai else None
        orch._anthropic = AsyncMock() if anthropic else None
        orch._cloud_gpu = AsyncMock() if cloud_gpu else None
        return orch


@pytest.mark.asyncio
async def test_generate_uses_ollama_by_default():
    orch = _make_orchestrator()
    orch._ollama.generate = AsyncMock(return_value="로컬 응답")
    msgs = [Message(role="user", content="안녕")]

    text, provider = await orch.generate(msgs, provider="ollama")

    assert text == "로컬 응답"
    assert provider == "ollama"


@pytest.mark.asyncio
async def test_generate_fallback_on_ollama_failure():
    orch = _make_orchestrator(cloud_gpu=True)
    orch._ollama.generate = AsyncMock(
        side_effect=AetherError("LLM_UNAVAILABLE", "Ollama 오프라인", None, 503)
    )
    orch._cloud_gpu.generate = AsyncMock(return_value="클라우드 GPU 응답")
    msgs = [Message(role="user", content="안녕")]

    text, provider = await orch.generate(msgs, provider="ollama")

    assert text == "클라우드 GPU 응답"
    assert provider == "cloud_gpu"


@pytest.mark.asyncio
async def test_generate_all_providers_fail_raises():
    orch = _make_orchestrator()
    orch._ollama.generate = AsyncMock(
        side_effect=AetherError("LLM_UNAVAILABLE", "실패", None, 503)
    )
    msgs = [Message(role="user", content="안녕")]

    with pytest.raises(AetherError) as exc_info:
        await orch.generate(msgs, provider="ollama")

    assert exc_info.value.code == "ALL_PROVIDERS_FAILED"


@pytest.mark.asyncio
async def test_available_providers_only_ollama():
    orch = _make_orchestrator()
    assert orch.available_providers() == ["ollama"]


@pytest.mark.asyncio
async def test_available_providers_with_cloud():
    orch = _make_orchestrator(openai=True, cloud_gpu=True)
    available = orch.available_providers()
    assert "ollama" in available
    assert "openai" in available
    assert "cloud_gpu" in available
    assert "anthropic" not in available


@pytest.mark.asyncio
async def test_get_unconfigured_provider_raises():
    orch = _make_orchestrator()

    with pytest.raises(AetherError) as exc_info:
        orch._get_provider("openai")  # openai 미설정

    assert exc_info.value.code == "PROVIDER_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_embed_falls_back_to_openai():
    orch = _make_orchestrator(openai=True)
    orch._ollama.embed = AsyncMock(
        side_effect=AetherError("EMBED_ERROR", "Ollama 임베딩 실패", None, 503)
    )
    orch._openai.embed = AsyncMock(return_value=[0.1, 0.2, 0.3])

    result = await orch.embed("테스트")

    assert result == [0.1, 0.2, 0.3]
