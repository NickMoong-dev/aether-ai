from typing import Dict, List, Optional
from pydantic import BaseModel


class EncyclopediaEntry(BaseModel):
    id: str
    title: str
    content: str
    tags: List[str] = []


class RAGQueryRequest(BaseModel):
    query: str
    top_k: int = 5
    entries: List[EncyclopediaEntry]
    embeddings: Optional[Dict[str, List[float]]] = None  # {id: vector}


class RAGQueryResult(BaseModel):
    entry: EncyclopediaEntry
    score: float


class RAGQueryResponse(BaseModel):
    success: bool = True
    results: List[RAGQueryResult]


class RAGIndexRequest(BaseModel):
    entries: List[EncyclopediaEntry]


class RAGIndexResponse(BaseModel):
    success: bool = True
    embeddings: Dict[str, List[float]]  # {id: vector}
    indexed_count: int
