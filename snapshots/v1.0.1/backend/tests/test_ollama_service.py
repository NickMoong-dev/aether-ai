from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.core.exceptions import AetherError
from app.models.generation import Message
from app.services.ollama_service import OllamaService


@pytest.mark.asyncio
async def test_generate_success():
    svc = OllamaService()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"message": {"content": "안녕하세요!"}}
    mock_resp.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(
            return_value=mock_resp
        )
        result = await svc.generate([Message(role="user", content="안녕")])

    assert result == "안녕하세요!"


@pytest.mark.asyncio
async def test_generate_timeout_raises_aether_error():
    svc = OllamaService()
    svc.max_retries = 0  # 재시도 없이 바로 실패

    with patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(
            side_effect=httpx.TimeoutException("timeout")
        )
        with pytest.raises(AetherError) as exc_info:
            await svc.generate([Message(role="user", content="안녕")])

    assert exc_info.value.code == "LLM_TIMEOUT"
    assert exc_info.value.status_code == 504


@pytest.mark.asyncio
async def test_generate_http_error_raises_aether_error():
    svc = OllamaService()

    with patch("httpx.AsyncClient") as mock_client:
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "500", request=MagicMock(), response=MagicMock()
        )
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(
            return_value=mock_resp
        )
        with pytest.raises(AetherError) as exc_info:
            await svc.generate([Message(role="user", content="안녕")])

    assert exc_info.value.code == "LLM_ERROR"
    assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_embed_success():
    svc = OllamaService()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"embedding": [0.1, 0.2, 0.3]}
    mock_resp.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(
            return_value=mock_resp
        )
        result = await svc.embed("테스트 텍스트")

    assert result == [0.1, 0.2, 0.3]
