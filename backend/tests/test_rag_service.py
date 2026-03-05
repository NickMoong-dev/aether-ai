from unittest.mock import AsyncMock

import pytest

from app.models.rag import EncyclopediaEntry
from app.services.ollama_service import OllamaService
from app.services.rag_service import RAGService, cosine_similarity


# ── 유틸 테스트 ──────────────────────────────────────────────────────

def test_cosine_similarity_identical():
    assert abs(cosine_similarity([1.0, 0.0], [1.0, 0.0]) - 1.0) < 1e-6


def test_cosine_similarity_orthogonal():
    assert abs(cosine_similarity([1.0, 0.0], [0.0, 1.0])) < 1e-6


def test_cosine_similarity_zero_vector():
    assert cosine_similarity([0.0, 0.0], [1.0, 0.0]) == 0.0


# ── RAGService 테스트 ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_query_returns_top_k():
    mock_ollama = AsyncMock(spec=OllamaService)
    mock_ollama.embed = AsyncMock(return_value=[1.0, 0.0, 0.0])

    svc = RAGService(mock_ollama)
    entries = [
        EncyclopediaEntry(id="1", title="드래곤", content="불을 뿜는 거대한 용"),
        EncyclopediaEntry(id="2", title="기사", content="용감한 전사"),
    ]
    embeddings = {
        "1": [1.0, 0.0, 0.0],  # 쿼리와 완전 일치
        "2": [0.0, 1.0, 0.0],  # 직교
    }

    results = await svc.query("드래곤 불", entries, embeddings, top_k=1)

    assert len(results) == 1
    assert results[0].entry.id == "1"
    assert abs(results[0].score - 1.0) < 1e-6


@pytest.mark.asyncio
async def test_query_skips_entries_without_embeddings():
    mock_ollama = AsyncMock(spec=OllamaService)
    mock_ollama.embed = AsyncMock(return_value=[1.0, 0.0])

    svc = RAGService(mock_ollama)
    entries = [
        EncyclopediaEntry(id="1", title="항목1", content="내용1"),
        EncyclopediaEntry(id="2", title="항목2", content="내용2"),  # 임베딩 없음
    ]
    embeddings = {"1": [1.0, 0.0]}

    results = await svc.query("검색어", entries, embeddings, top_k=5)

    assert len(results) == 1
    assert results[0].entry.id == "1"


@pytest.mark.asyncio
async def test_index_entries():
    mock_ollama = AsyncMock(spec=OllamaService)
    mock_ollama.embed = AsyncMock(return_value=[0.5, 0.5])

    svc = RAGService(mock_ollama)
    entries = [
        EncyclopediaEntry(id="a", title="제목A", content="내용A"),
        EncyclopediaEntry(id="b", title="제목B", content="내용B"),
    ]

    result = await svc.index_entries(entries)

    assert set(result.keys()) == {"a", "b"}
    assert result["a"] == [0.5, 0.5]
