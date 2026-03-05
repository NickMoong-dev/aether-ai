import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import AetherError, aether_error_handler
from app.routers import generation, health, rag

# ── 로깅 설정 ────────────────────────────────────────────────────────
logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# ── FastAPI 앱 ───────────────────────────────────────────────────────
app = FastAPI(
    title="Aether AI Backend",
    description="Aether AI Phase 1 — LLM & RAG API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────
# Electron 앱은 file:// 프로토콜로 로드되어 origin이 "null"로 옵니다.
# 개발/브라우저 테스트를 위해 localhost도 허용합니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null"],  # Electron file:// → origin: null
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 에러 핸들러 ──────────────────────────────────────────────────────
app.add_exception_handler(AetherError, aether_error_handler)

# ── 라우터 등록 ──────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(generation.router)
app.include_router(rag.router)
