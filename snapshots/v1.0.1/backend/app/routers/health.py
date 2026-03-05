import httpx
from fastapi import APIRouter

from app.core.config import settings
from app.services.orchestrator import orchestrator

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    """서비스 전체 상태 확인."""
    ollama_status = "disconnected"
    ollama_models: list = []

    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                ollama_status = "connected"
                ollama_models = [m["name"] for m in resp.json().get("models", [])]
    except Exception:
        pass

    return {
        "success": True,
        "status": "ok",
        "services": {
            "fastapi": "running",
            "ollama": ollama_status,
        },
        "ollama_models": ollama_models,
        "available_providers": orchestrator.available_providers(),
        "default_provider": settings.default_provider,
    }


@router.get("/api/v1/providers")
async def list_providers() -> dict:
    """설정된 AI 프로바이더 목록 및 상세 정보."""
    providers = {}

    # Ollama
    ollama_ok = False
    ollama_models: list = []
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                ollama_ok = True
                ollama_models = [m["name"] for m in resp.json().get("models", [])]
    except Exception:
        pass

    providers["ollama"] = {
        "status": "connected" if ollama_ok else "disconnected",
        "base_url": settings.ollama_base_url,
        "default_model": settings.ollama_model,
        "models": ollama_models,
        "type": "local",
    }

    # OpenAI
    if settings.is_openai_configured():
        providers["openai"] = {
            "status": "configured",
            "base_url": settings.openai_base_url,
            "default_model": settings.openai_model,
            "type": "cloud",
        }

    # Anthropic
    if settings.is_anthropic_configured():
        providers["anthropic"] = {
            "status": "configured",
            "default_model": settings.anthropic_model,
            "type": "cloud",
        }

    # Cloud GPU
    if settings.is_cloud_gpu_configured():
        providers["cloud_gpu"] = {
            "status": "configured",
            "base_url": settings.cloud_gpu_base_url,
            "default_model": settings.cloud_gpu_model,
            "type": "cloud_gpu",
        }

    return {
        "success": True,
        "default_provider": settings.default_provider,
        "auto_fallback": settings.auto_fallback,
        "fallback_order": settings.fallback_order,
        "providers": providers,
    }
