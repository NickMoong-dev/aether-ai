import math
from typing import Dict, List

from loguru import logger

from app.models.rag import EncyclopediaEntry, RAGQueryResult
from app.services.ollama_service import OllamaService


def cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class RAGService:
    """RAG 검색 서비스 — 코사인 유사도 기반 Top-K 백과사전 검색."""

    def __init__(self, ollama_service: OllamaService) -> None:
        self.ollama = ollama_service

    async def index_entries(
        self, entries: List[EncyclopediaEntry]
    ) -> Dict[str, List[float]]:
        """백과사전 항목을 임베딩하여 벡터 딕셔너리 반환."""
        embeddings: Dict[str, List[float]] = {}
        for entry in entries:
            text = f"{entry.title}\n{entry.content}"
            try:
                vector = await self.ollama.embed(text)
                embeddings[entry.id] = vector
                logger.info(f"인덱싱 완료: {entry.id} ({entry.title})")
            except Exception as exc:
                logger.warning(f"인덱싱 실패 — {entry.id}: {exc}")
        return embeddings

    async def query(
        self,
        query_text: str,
        entries: List[EncyclopediaEntry],
        embeddings: Dict[str, List[float]],
        top_k: int = 5,
    ) -> List[RAGQueryResult]:
        """쿼리 텍스트와 가장 유사한 백과사전 항목 Top-K 반환."""
        query_vector = await self.ollama.embed(query_text)

        scored: List[RAGQueryResult] = []
        for entry in entries:
            if entry.id in embeddings:
                score = cosine_similarity(query_vector, embeddings[entry.id])
                scored.append(RAGQueryResult(entry=entry, score=score))

        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[:top_k]
