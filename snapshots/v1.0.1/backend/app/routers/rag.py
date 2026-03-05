from fastapi import APIRouter

from app.models.rag import (
    RAGIndexRequest,
    RAGIndexResponse,
    RAGQueryRequest,
    RAGQueryResponse,
)
from app.services.ollama_service import OllamaService
from app.services.rag_service import RAGService

router = APIRouter(prefix="/api/v1/rag", tags=["rag"])

_ollama = OllamaService()
_rag = RAGService(_ollama)


@router.post("/query", response_model=RAGQueryResponse)
async def query_rag(req: RAGQueryRequest) -> RAGQueryResponse:
    """쿼리 텍스트와 유사한 백과사전 항목 Top-K 검색."""
    embeddings = req.embeddings or {}
    results = await _rag.query(req.query, req.entries, embeddings, req.top_k)
    return RAGQueryResponse(results=results)


@router.post("/index", response_model=RAGIndexResponse)
async def index_entries(req: RAGIndexRequest) -> RAGIndexResponse:
    """백과사전 항목을 임베딩하여 벡터 인덱스 반환."""
    embeddings = await _rag.index_entries(req.entries)
    return RAGIndexResponse(
        embeddings=embeddings,
        indexed_count=len(embeddings),
    )
