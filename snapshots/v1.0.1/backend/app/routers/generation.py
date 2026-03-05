from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.models.generation import GenerateRequest, GenerateResponse
from app.services.orchestrator import orchestrator

router = APIRouter(prefix="/api/v1", tags=["generation"])


@router.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest) -> GenerateResponse:
    """단일 LLM 응답 생성.

    provider 필드로 사용할 프로바이더를 지정할 수 있습니다:
    - "ollama"    : 로컬 Ollama (기본)
    - "openai"    : OpenAI GPT
    - "anthropic" : Anthropic Claude
    - "cloud_gpu" : 클라우드 GPU (RunPod / Modal / Together.ai 등)
    - "auto"      : 자동 선택 (설정된 default_provider, 실패 시 폴백)
    """
    text, used_provider = await orchestrator.generate(
        req.messages, req.system, req.max_tokens, req.model, req.provider
    )
    return GenerateResponse(
        text=text,
        model=req.model or "",
        provider=used_provider,
    )


@router.post("/generate/stream")
async def generate_stream(req: GenerateRequest) -> StreamingResponse:
    """스트리밍 LLM 응답 (SSE — text/event-stream).

    응답 헤더 X-Provider 에 사용된 프로바이더가 포함됩니다.
    """
    stream, used_provider = await orchestrator.generate_stream(
        req.messages, req.system, req.max_tokens, req.model, req.provider
    )

    async def event_stream():
        async for token in stream:
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"X-Provider": used_provider},
    )
