from fastapi import Request
from fastapi.responses import JSONResponse


class AetherError(Exception):
    """Aether 통일 에러 클래스."""

    def __init__(
        self,
        code: str,
        message: str,
        detail: str | None = None,
        status_code: int = 500,
    ):
        self.code = code
        self.message = message
        self.detail = detail
        self.status_code = status_code
        super().__init__(message)


async def aether_error_handler(request: Request, exc: AetherError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.code,
                "message": exc.message,
                "detail": exc.detail,
            },
        },
    )
