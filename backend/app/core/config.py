from typing import Literal
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Ollama (로컬 GPU) ────────────────────────────────────────────
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_timeout: int = 30
    ollama_max_retries: int = 2

    # ── OpenAI ───────────────────────────────────────────────────────
    openai_api_key: SecretStr = SecretStr("")
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"  # 변경 시 호환 엔드포인트 사용 가능
    openai_timeout: int = 60

    # ── Anthropic Claude ─────────────────────────────────────────────
    anthropic_api_key: SecretStr = SecretStr("")
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_timeout: int = 60

    # ── 클라우드 GPU (OpenAI 호환 엔드포인트) ──────────────────────────
    # RunPod, Modal, Together.ai, Groq, Replicate 등
    cloud_gpu_api_key: SecretStr = SecretStr("")
    cloud_gpu_base_url: str = ""          # e.g. https://api.together.xyz/v1
    cloud_gpu_model: str = ""             # e.g. meta-llama/Llama-3-70b-chat-hf
    cloud_gpu_timeout: int = 120          # GPU cold-start 고려해 넉넉하게

    # ── AI 오케스트레이터 ────────────────────────────────────────────
    # "ollama" | "openai" | "anthropic" | "cloud_gpu" | "auto"
    default_provider: Literal["ollama", "openai", "anthropic", "cloud_gpu", "auto"] = "ollama"
    # auto 모드 또는 지정 프로바이더 실패 시 자동 폴백 순서
    auto_fallback: bool = True
    # 폴백 순서: 앞에 있을수록 먼저 시도
    fallback_order: list[str] = ["ollama", "cloud_gpu", "openai", "anthropic"]

    # ── FastAPI 서버 ─────────────────────────────────────────────────
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # ── 로그 ────────────────────────────────────────────────────────
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ── 헬퍼 ────────────────────────────────────────────────────────
    def is_openai_configured(self) -> bool:
        return bool(self.openai_api_key.get_secret_value())

    def is_anthropic_configured(self) -> bool:
        return bool(self.anthropic_api_key.get_secret_value())

    def is_cloud_gpu_configured(self) -> bool:
        return bool(
            self.cloud_gpu_api_key.get_secret_value() and self.cloud_gpu_base_url
        )


settings = Settings()
