# Aether AI — claude.md (AI Coding Assistant Directive)

> 이 문서는 AI 코딩 어시스턴트가 Aether AI 프로젝트의 코드를 작성할 때 **반드시** 참조해야 하는 최상위 지침서입니다.
> 현재 상태(As-Is)와 목표 아키텍처(To-Be)를 모두 포함하며, AI는 항상 **현재 Phase**에 맞는 코드를 작성해야 합니다.

---

## 1. Project Vision & Core Philosophy

**Aether**(에테르)는 단순한 웹소설 작성 도구가 아니라, **온톨로지(Ontology) 기반의 IP 확장 및 관리 플랫폼**입니다.

현재의 단일 파일 MVP를 모듈형 마이크로 서비스 아키텍처(MSA)로 **점진적으로** 전환하는 것이 목표입니다.

### 핵심 원칙

| 원칙 | 설명 |
|---|---|
| **Thin Client** | 프론트엔드는 UI 렌더링과 API 호출만 담당한다. 비즈니스 로직을 포함하지 않는다. |
| **Micro-API First** | 모든 기능(AI 추론, 파일 저장, RAG 등)은 독립된 Python 기반 REST API로 분리한다. |
| **Polyglot Persistence** | 데이터 성격에 따라 DB를 분리한다 (Graph, Vector, RDB). 단일 JSON 저장을 탈피한다. |
| **Strangler Fig Pattern** | 기존 코드를 한 번에 갈아엎지 않고, 기능을 하나씩 Python API로 점진적 이관한다. |
| **Graceful Degradation** | 새 API가 미완성이면 기존 로직(preload.js/IPC 또는 localStorage)이 폴백으로 동작해야 한다. |

---

## 2. Current State (As-Is) — 반드시 숙지할 것

AI는 코드를 수정하기 전에 현재 프로젝트의 구조와 제약사항을 반드시 이해해야 합니다.

### 2.1 프로젝트 개요

- **타입**: 단일 HTML 파일 SPA (모든 CSS, JS, HTML이 인라인)
- **언어**: 바닐라 JavaScript (빌드 스텝 없음), 한국어 UI
- **런타임**: 브라우저 (standalone) 또는 Electron 데스크톱 앱
- **빌드 도구 없음**: npm, 번들러, 프레임워크 없음

### 2.2 런타임 감지

```js
const IS_ELECTRON = typeof window.aether !== 'undefined';
```

- `window.aether` 존재 → Electron 모드 (네이티브 파일 I/O)
- `window.aether` 미존재 → 브라우저 모드 (localStorage 폴백)

### 2.3 파일 구조 (현재)

```
├── index.html          ← Aether 단일 HTML 파일 (렌더러, 인라인 CSS/JS 전부 포함)
├── main.js             ← Electron 메인 프로세스
├── preload.js          ← contextBridge로 window.aether API 노출
├── renderer.js         ← 렌더러 엔트리 (인라인 JS 보조)
├── package.json        ← 앱 메타데이터 + electron-builder 설정
└── release-notes.json  ← What's New 릴리즈 노트
```

### 2.4 데이터 영속화

#### 브라우저 모드 (localStorage)

| Key | 내용 |
|---|---|
| `ae_projects_v1` | 전체 프로젝트, 에피소드, 캐릭터, 관계, 설정 |
| `ae_ency_v1` | RAG 백과사전 항목 |
| `ae_ency_embed_v1` | 백과사전 임베딩 벡터 |
| `ae_api_settings` | API 설정 (Ollama URL/모델, ComfyUI URL/모델 경로) |
| `ae_revisions_v1` | 에피소드 수정 이력 |
| `ae_summaries_v1` | 에피소드 AI 요약 |
| `ae_history_v1` | 실행 취소/휴지통 이력 |
| `ae_wdict_v1` | 세계 사전 |
| `ae_ollama_ok` | Ollama 연결 상태 캐시 |
| `ae_comfy_ok` | ComfyUI 연결 상태 캐시 |
| `ae_last_upd_check` | 마지막 업데이트 확인 타임스탬프 |
| `ae_editor_fmt` | 에디터 포맷 설정 |
| `ae_upd_settings` | 업데이트 설정 |
| `ae_theme` | 현재 테마 (`dark` / `light`) |

#### Electron 모드 (파일시스템)

```
{userData}/
  ├── projects.json           ← ae_projects_v1
  ├── settings.json           ← ae_api_settings + 통합 설정
  ├── encyclopedia.json       ← ae_ency_v1
  ├── ency_embeddings.json    ← ae_ency_embed_v1
  ├── history.json            ← ae_history_v1
  ├── world_dict.json         ← ae_wdict_v1
  ├── revisions.json          ← ae_revisions_v1
  ├── summaries.json          ← ae_summaries_v1
  ├── app-meta.json           ← What's New 마지막 확인 버전
  ├── logs/                   ← 일별 로그 파일 (최대 7일)
  └── backups/                ← gzip 압축 백업 (.aebak, 최대 20개)
```

```js
const { app } = require('electron');
const dataDir = path.join(app.getPath('userData'), 'data');
```

### 2.5 AI 통합 (로컬 전용)

모든 AI 기능은 **로컬 서비스**만 호출합니다. 클라우드 API 키가 필요하지 않습니다.

#### Ollama (LLM)

- **기본 URL**: `http://localhost:11434`
- **기본 모델**: `llama3.2` (설치된 모든 모델 지원: gemma3, qwen2.5 등)
- **임베딩 모델**: `nomic-embed-text` (RAG/로어북용)
- **CORS**: `OLLAMA_ORIGINS=* ollama serve`로 시작 필수
- **용도**: AI 채팅, 브레인스토밍, 캐릭터 분석, 관계 분석, 커버 프롬프트 생성, 문서 확장, 에피소드 요약, 에피소드 제안, 백과사전 인덱싱

#### ComfyUI (이미지 생성)

- **기본 URL**: `http://localhost:8188`
- **모델**: NewBie-Image-Exp0.1 (애니메이션 스타일, AuraFlow 아키텍처)
- **실행 플래그**: `--enable-cors-header` 필수
- **용도**: 캐릭터 초상화 생성, 북커버 이미지 생성
- 모델 파일 경로 (`ComfyUI/models/`):
  - `diffusion_models/` — UNet (기본: `NewBie-Image-Exp0.1-bf16.safetensors`)
  - `clip/` — CLIP 1 (기본: `gemma_3_4b_it_bf16.safetensors`)
  - `clip/` — CLIP 2 (기본: `jina_clip_v2_bf16.safetensors`)
  - `vae/` — VAE (기본: `ae.safetensors`)

### 2.6 핵심 기능 목록

| 기능 | 설명 |
|---|---|
| Project Library | 소설 프로젝트 그리드 (Canvas API 기반 북커버) |
| Episode Editor | 자동저장, 글자 수 카운트, 에피소드 상태 추적 |
| Character Manager | 캐릭터 시트 (초상화, 태그, 관계) |
| Relationship Map | 캐릭터 관계를 시각화하는 캔버스 |
| Brainstorming Panel | AI 기반 아이디어 생성 (플롯, 캐릭터, 장면 등) |
| RAG Encyclopedia | 임베딩 기반 시맨틱 검색 로어북 (nomic-embed-text) |
| World Dictionary | 카테고리별 세계관 항목 (장소, 아이템, 세력 등) |
| Document Editor | 아웃라인 + AI 확장 |
| Episode Summarizer | 에피소드 요약 (LLM 컨텍스트 절약) |
| Revision History | 에피소드별 자동 스냅샷 및 수동 저장 |
| Cover Studio | 스타일 프리셋 + ComfyUI 기반 북커버 디자이너 |
| Export | TXT, PDF, EPUB 내보내기; 권별 내보내기 지원 |
| AI Chat | 로어북 컨텍스트 주입이 가능한 사이드바 AI 채팅 |
| Focus Mode | 집중 모드 (방해 요소 제거) |
| Dark / Light theme | 설정에서 토글 |

### 2.7 핵심 JavaScript 함수 (AI가 반드시 알아야 할 것)

| 함수 | 설명 | Phase 1 이관 대상 |
|---|---|---|
| `callLLM(messages, system, maxTokens)` | Ollama LLM 호출 (stream 설정 자동 분기) | **Yes** → FastAPI |
| `callLLMStream(messages, system, maxTokens, onToken, onDone)` | 스트리밍 LLM (토큰 콜백) | **Yes** → FastAPI SSE |
| `aiGen(type)` | 로어북 컨텍스트 주입 AI 텍스트 생성 | **Yes** → FastAPI |
| `buildLoreContext(queryText)` | 코사인 유사도 Top-K 백과사전 검색 | **Yes** → FastAPI RAG |
| `saveData()` / `loadData()` | 프로젝트 영속화 (Electron or localStorage) | Phase 2 |
| `saveAllSettings()` / `loadAllSettings()` | 통합 설정 저장/로드 | Phase 2 |
| `renderHome()` | 프로젝트 라이브러리 그리드 렌더링 | Phase 4 |
| `openProject(id)` | 프로젝트 에디터 뷰 전환 | Phase 4 |
| `initApp()` | 앱 부트스트랩 (데이터 로드, IPC 리스너) | Phase 4 |

### 2.8 UI/스타일

- **폰트**: Noto Serif KR (본문), Cinzel (제목), Noto Sans KR (UI) — Google Fonts
- **지원 장르**: 판타지, 현대 판타지, 로맨스, 로맨스 판타지, SF, 무협, 공포, 미스터리, 현대
- **HTML 구조**: 모달 기반 패턴 (`<div class="modal-overlay">` + `.show` 클래스 토글)
- **CSS**: `<head>` 상단에 minified CSS (대형 base64 아이콘 + 인라인 스타일) — **절대 건드리지 마라**
- **JS**: `<body>` 하단에 단일 `<script>` 블록

### 2.9 Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob:;
connect-src 'self' http://localhost:* ws://localhost:*;
```

모든 외부 연결(Ollama, ComfyUI, FastAPI)은 `localhost`에서만 허용됩니다.

---

## 3. Electron IPC 명세

### 3.1 BrowserWindow 설정

```js
const mainWindow = new BrowserWindow({
  width: 1400, height: 900,
  frame: false,                    // 커스텀 타이틀바 (frameless)
  titleBarStyle: 'hidden',         // macOS: 네이티브 신호등 버튼 유지
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
});
mainWindow.loadFile('index.html');
```

### 3.2 커스텀 타이틀바

- **frameless window** (`frame: false`) + HTML 커스텀 타이틀바
- 타이틀바 높이: `36px` (CSS 변수 `--titlebar-height`)
- macOS: `body.platform-darwin` 클래스 → 신호등 버튼 영역(72px) 확보, 커스텀 버튼 숨김
- `window-state` 이벤트 → 최대화/복원 아이콘 전환 (`□` ↔ `❐`)
- `-webkit-app-region: drag`로 창 드래그

`getAppInfo()` 반환: `{ version: '1.0.0', platform: 'win32', electron: '28.0.0' }`

### 3.3 IPC 핸들러 (renderer → main)

#### 데이터 저장/로드

| IPC 채널 | 설명 |
|---|---|
| `save-projects` / `load-projects` | 프로젝트 JSON |
| `save-settings` / `load-settings` | 통합 설정 JSON |
| `save-ency` / `load-ency` | 백과사전 항목 JSON |
| `save-ency-embed` / `load-ency-embed` | 임베딩 벡터 JSON |
| `save-history` / `load-history` | 휴지통/취소 이력 JSON |
| `save-world-dict` / `load-world-dict` | 세계사전 JSON |
| `save-revisions` / `load-revisions` | 수정 이력 JSON |
| `save-summaries` / `load-summaries` | 에피소드 요약 JSON |

#### 시스템

| IPC 채널 | 설명 |
|---|---|
| `get-app-info` | 앱 정보 `{ version, platform, electron }` |
| `print-to-pdf` | HTML → PDF 변환 (별도 숨겨진 BrowserWindow → 네이티브 저장 다이얼로그) |
| `save-file` | 네이티브 파일 저장 `{ defaultName, ext, b64 }` (base64 → 바이너리) |
| `window-minimize` / `window-maximize` / `window-close` | 창 제어 |

#### Auto-Setup (Ollama + ComfyUI)

| IPC 채널 | 설명 |
|---|---|
| `setup-ollama-check` | 상태 확인 → `{ installed, running, models[], path }` |
| `setup-ollama-install` | 다운로드 + 설치 (동의 다이얼로그) |
| `setup-ollama-start` | 서비스 시작 (`OLLAMA_ORIGINS=*`) |
| `setup-ollama-pull` | 모델 다운로드 (예: `llama3.2`) |
| `setup-ollama-full` | 전체 자동: 설치 → 시작 → 기본 모델 pull |
| `setup-comfy-check` | 상태 확인 → `{ installed, running, path, models }` |
| `setup-comfy-install` | 포터블 다운로드 + 압축 해제 (동의 다이얼로그) |
| `setup-comfy-start` | 서버 시작 (`--enable-cors-header`) |
| `setup-comfy-model` | 모델 파일 다운로드 `{ key, url }` |
| `setup-comfy-full` | 전체 자동: 포터블 설치 → 서버 시작 |
| `setup-comfy-set-model-url` | 모델 URL 업데이트 `{ key, url }` |

#### 선택적 IPC (없어도 핵심 기능 동작)

| 그룹 | 채널 |
|---|---|
| 로그 뷰어 | `log-list`, `log-read`, `log-export`, `log-open-dir` |
| 백업 관리 | `backup-list`, `backup-now`, `backup-restore`, `backup-delete`, `backup-export`, `backup-import`, `backup-open-dir` |
| 피드백 | `feedback-send` (Discord 웹훅) |
| What's New | `whats-new-get`, `whats-new-seen` |

### 3.4 IPC 이벤트 (main → renderer)

| 이벤트 | 페이로드 | 설명 |
|---|---|---|
| `window-state` | `'maximized'` \| `'unmaximized'` | 창 상태 변경 |
| `menu-action` | `string` | 메뉴 클릭 (`'new-project'`, `'export'`, `'find-replace'`, `'whats-new'`, `'feedback'`, `'log-viewer'`) |
| `whats-new` | `{ notes: string }` | What's New 자동 팝업 |
| `backup-done` | `{ success: boolean }` | 자동 백업 완료 |
| `log-line` | `{ level, ts, msg }` | 실시간 로그 스트림 |
| `setup-progress` | `{ stage, percent, message }` | 설치 진행률 |

### 3.5 preload.js — contextBridge API 전체 명세

```js
contextBridge.exposeInMainWorld('aether', {
  // ── 데이터 저장/로드 ──
  saveProjects:  (payload) => ipcRenderer.invoke('save-projects', payload),
  loadProjects:  ()        => ipcRenderer.invoke('load-projects'),
  saveSettings:  (payload) => ipcRenderer.invoke('save-settings', payload),
  loadSettings:  ()        => ipcRenderer.invoke('load-settings'),
  saveEncy:      (json)    => ipcRenderer.invoke('save-ency', json),
  loadEncy:      ()        => ipcRenderer.invoke('load-ency'),
  saveEncyEmbed: (json)    => ipcRenderer.invoke('save-ency-embed', json),
  loadEncyEmbed: ()        => ipcRenderer.invoke('load-ency-embed'),
  saveHistory:   (json)    => ipcRenderer.invoke('save-history', json),
  loadHistory:   ()        => ipcRenderer.invoke('load-history'),
  saveWorldDict: (payload) => ipcRenderer.invoke('save-world-dict', payload),
  loadWorldDict: ()        => ipcRenderer.invoke('load-world-dict'),
  saveRevisions: (payload) => ipcRenderer.invoke('save-revisions', payload),
  loadRevisions: ()        => ipcRenderer.invoke('load-revisions'),
  saveSummaries: (payload) => ipcRenderer.invoke('save-summaries', payload),
  loadSummaries: ()        => ipcRenderer.invoke('load-summaries'),

  // ── 파일 작업 ──
  printToPDF: (opts) => ipcRenderer.invoke('print-to-pdf', opts),
  saveFile:   (opts) => ipcRenderer.invoke('save-file', opts),

  // ── 앱 정보 & 창 제어 ──
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  minimize:   () => ipcRenderer.invoke('window-minimize'),
  maximize:   () => ipcRenderer.invoke('window-maximize'),
  close:      () => ipcRenderer.invoke('window-close'),

  // ── IPC 이벤트 리스너 ──
  on: (channel, handler) => {
    const allowed = ['window-state','menu-action','whats-new','backup-done','log-line'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => handler(...args));
    }
  },

  // ── 선택: 로그 뷰어 ──
  log: {
    list:    ()            => ipcRenderer.invoke('log-list'),
    read:    (file, lines) => ipcRenderer.invoke('log-read', file, lines),
    export:  (file)        => ipcRenderer.invoke('log-export', file),
    openDir: ()            => ipcRenderer.invoke('log-open-dir'),
  },

  // ── 선택: 백업 관리 ──
  backup: {
    list:    ()    => ipcRenderer.invoke('backup-list'),
    now:     ()    => ipcRenderer.invoke('backup-now'),
    restore: (fp)  => ipcRenderer.invoke('backup-restore', fp),
    delete:  (fp)  => ipcRenderer.invoke('backup-delete', fp),
    export:  (fp)  => ipcRenderer.invoke('backup-export', fp),
    import:  ()    => ipcRenderer.invoke('backup-import'),
    openDir: ()    => ipcRenderer.invoke('backup-open-dir'),
  },

  // ── 선택: 피드백 ──
  feedback: { send: (wh, p) => ipcRenderer.invoke('feedback-send', wh, p) },

  // ── 선택: What's New ──
  whatsNew: {
    get:  () => ipcRenderer.invoke('whats-new-get'),
    seen: () => ipcRenderer.invoke('whats-new-seen'),
  },

  // ── 선택: Auto-Setup ──
  setup: {
    ollamaCheck:      ()    => ipcRenderer.invoke('setup-ollama-check'),
    ollamaInstall:    ()    => ipcRenderer.invoke('setup-ollama-install'),
    ollamaStart:      ()    => ipcRenderer.invoke('setup-ollama-start'),
    ollamaPull:       (m)   => ipcRenderer.invoke('setup-ollama-pull', m),
    ollamaFull:       ()    => ipcRenderer.invoke('setup-ollama-full'),
    comfyCheck:       ()    => ipcRenderer.invoke('setup-comfy-check'),
    comfyInstall:     ()    => ipcRenderer.invoke('setup-comfy-install'),
    comfyStart:       ()    => ipcRenderer.invoke('setup-comfy-start'),
    comfyModel:       (opt) => ipcRenderer.invoke('setup-comfy-model', opt),
    comfyFull:        ()    => ipcRenderer.invoke('setup-comfy-full'),
    comfySetModelUrl: (opt) => ipcRenderer.invoke('setup-comfy-set-model-url', opt),
  },
});
```

> **최소 실행**: `main.js`에 BrowserWindow + 창 제어 IPC 3개 + `get-app-info`만 구현하면 앱이 실행됩니다. 데이터 저장 IPC가 없으면 `window.aether`가 정의되지 않아야 자동 localStorage 폴백이 동작합니다.

> **주의**: `preload.js`에서 `window.aether`를 등록하면 `IS_ELECTRON === true`가 되어 모든 저장/로드가 IPC를 시도합니다. 등록한 모든 메서드에 대해 `main.js` 핸들러가 반드시 필요합니다.

---

## 4. Target Architecture (To-Be)

코드를 작성할 때 항상 아래의 최종 아키텍처를 염두에 둔다.

```
[ Frontend (React in Electron) ]  ← Thin Client (UI & 상태 관리만)
      | (HTTP/REST)
      v
[ API Gateway: FastAPI ]          ← 인증, 라우팅, Rate Limiting
      |
      ├── [ Workspace API ]       → PostgreSQL (에피소드, 설정, 사용자 데이터)
      |
      ├── [ Ontology Engine API ] → Neo4j (인물/사건 관계도, 지식 그래프)
      |
      ├── [ RAG & Search API ]    → ChromaDB / Milvus (벡터 임베딩, 유사도 검색)
      |
      └── [ AI Orchestrator API ] → LangChain 라우팅 (로컬 Ollama ↔ 클라우드 GPU)
```

### 통신 규약

- 프론트엔드 ↔ 백엔드: HTTP/REST (JSON). WebSocket은 스트리밍 생성 응답에만 사용.
- API 스키마 계약: **Pydantic 모델이 Single Source of Truth.** 프론트엔드는 OpenAPI(Swagger) 스펙에서 타입을 자동 생성.
- 에러 응답 포맷 (모든 API 통일):

```json
{
  "success": false,
  "error": {
    "code": "ONTOLOGY_ENTITY_NOT_FOUND",
    "message": "사용자에게 표시할 메시지",
    "detail": "디버깅용 상세 정보 (production에서는 생략)"
  }
}
```

### Tech Stack (To-Be)

| 레이어 | 기술 | 비고 |
|---|---|---|
| **Frontend** | React.js, TailwindCSS, Electron (셸) | Electron은 순수 껍데기. 렌더러에 로직 금지 |
| **Backend** | Python 3.10+, FastAPI, Pydantic v2, Uvicorn | 모든 비즈니스 로직의 유일한 위치 |
| **AI/ML** | LangChain, LlamaIndex, SpaCy | Orchestrator가 모델 라우팅 담당 |
| **RDB** | SQLite (Phase 1~2) → PostgreSQL (Phase 3+) | Alembic으로 마이그레이션 관리 |
| **Vector DB** | ChromaDB (로컬) → Milvus (클라우드 확장 시) | |
| **Graph DB** | Neo4j | Phase 3에서 도입 |
| **AI Runtime** | Ollama (로컬 LLM), ComfyUI (로컬 이미지) | 현재와 동일 |
| **컨테이너** | Docker, Docker Compose | 로컬 개발 환경 통일용 |

---

## 5. Migration Plan (Phase-by-Phase)

> **AI는 사용자가 지시하는 작업이 현재 어느 Phase에 속하는지 파악하고, 그에 맞는 코드를 작성해야 한다.**

### Phase 1: API 분리의 시작 ← 현재 단계

**목표:** `main.js`/`index.html`의 AI·RAG 로직을 FastAPI로 이관. 프론트엔드가 HTTP로 백엔드를 호출하는 구조 확립.

**작업 내용:**
- `main.js`의 RAG(nomic-embed) 및 Ollama 호출 로직 제거
- FastAPI 서버를 로컬에 띄우고 Python으로 재작성
- `index.html`의 `callLLM()`, `buildLoreContext()` 등을 FastAPI `fetch()`로 호출하도록 수정
- **기존 IPC 채널과 localStorage 폴백은 그대로 유지** (Graceful Degradation)

**백엔드 디렉토리 구조:**

```
backend/
├── app/
│   ├── main.py              # FastAPI 앱 엔트리포인트
│   ├── core/
│   │   ├── config.py         # 환경 변수, 설정값 (pydantic-settings)
│   │   └── exceptions.py     # 커스텀 예외 및 통일 에러 핸들러
│   ├── routers/              # 엔드포인트 정의 (Controller)
│   │   ├── generation.py     # /api/v1/generate (LLM 호출)
│   │   ├── rag.py            # /api/v1/rag (임베딩 검색)
│   │   └── health.py         # /health
│   ├── services/             # 비즈니스 로직 (Service 레이어)
│   │   ├── llm_provider.py   # LLM 추상 인터페이스
│   │   ├── ollama_service.py # Ollama 구현체
│   │   └── rag_service.py    # RAG 검색 로직
│   ├── models/               # Pydantic 스키마 (Request/Response DTO)
│   │   ├── generation.py
│   │   └── rag.py
│   └── repositories/         # DB 접근 레이어 (Phase 2에서 활성화)
├── prompts/                  # LLM 프롬프트 템플릿 (.txt, .jinja2)
├── tests/
│   ├── test_ollama_service.py
│   └── test_rag_service.py
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

**완료 기준 (Definition of Done):**
- [ ] `main.js`에서 AI/RAG 관련 코드가 완전히 제거됨
- [ ] FastAPI `/api/v1/generate`, `/api/v1/generate/stream`, `/api/v1/rag/query` 엔드포인트 동작
- [ ] `index.html`이 FastAPI를 통해 텍스트 생성 및 RAG 검색 가능
- [ ] FastAPI 미실행 시, 기존 Ollama 직접 호출 또는 IPC 폴백이 정상 동작
- [ ] 헬스체크 엔드포인트 (`/health`) 존재
- [ ] 기존 localStorage/IPC 저장 로직에 영향 없음
- [ ] `services/` 레이어에 대한 pytest 테스트 존재

### Phase 2: DB 분리 (Polyglot Migration)

**목표:** `.json` 파일 기반 저장소를 적절한 DB로 마이그레이션.

**작업 내용:**
- `encyclopedia.json`, `projects.json` 등 → SQLite(로컬)
- Alembic 도입 (스키마 버전 관리)
- 벡터 임베딩 → ChromaDB 분리
- JSON → DB 마이그레이션 스크립트 (`backend/scripts/`)
- `repositories/` 레이어 활성화, 서비스 레이어에서 직접 파일 I/O 금지

**완료 기준:**
- [ ] 모든 영속 데이터가 SQLite에 저장됨 (JSON 파일 의존 제거)
- [ ] Alembic 마이그레이션 히스토리 존재
- [ ] 벡터 임베딩이 ChromaDB에 저장/검색됨
- [ ] JSON → DB 마이그레이션 스크립트 동작
- [ ] `repositories/` 레이어가 모든 DB 접근 담당

### Phase 3: Ontology 도입 및 Graph DB 구축

**목표:** 텍스트에서 엔티티·관계를 추출하고 Graph DB로 지식 그래프 구축.

**작업 내용:**
- SpaCy/LLM으로 텍스트 → 엔티티(인물, 장소) + 관계(Relation) 추출
- Neo4j에 저장하는 Ontology Engine API 구축
- SQLite → PostgreSQL 전환 (원격 DB 인프라 확립)
- 기존 Relationship Map 기능을 Graph DB 기반으로 전환

**완료 기준:**
- [ ] 텍스트 → 엔티티/관계 추출 파이프라인 동작
- [ ] Neo4j 지식 그래프 저장 및 Cypher 쿼리 조회 가능
- [ ] RDB가 PostgreSQL로 전환 완료
- [ ] Relationship Map이 Graph DB 데이터를 소스로 사용

### Phase 4: 프론트엔드 현대화 (React 전환)

**목표:** 바닐라 JS 기반 `index.html`을 React 컴포넌트 기반으로 완전히 재작성.

**작업 내용:**
- React + TailwindCSS로 UI 재작성
- OpenAPI 스펙 → TypeScript 타입 자동 생성 (`openapi-typescript-codegen` 등)
- 상태 관리: Zustand 또는 React Query
- Electron 커스텀 타이틀바, 테마 시스템을 React 컴포넌트로 이식

**완료 기준:**
- [ ] 기존 `index.html`의 모든 기능이 React 컴포넌트로 대체됨
- [ ] API 타입이 OpenAPI 스펙에서 자동 생성됨
- [ ] Electron 셸이 React 빌드 결과물 로드
- [ ] `index.html` 단일 파일이 더 이상 필요하지 않음

---

## 6. Strict Coding Rules (AI 행동 지침)

AI 코딩 어시스턴트는 다음 규칙을 **절대적으로** 준수한다.

### 6.1 아키텍처 규칙

1. **No Logic in UI:** `index.html`이나 렌더러 스크립트에 새로운 데이터 처리, 임베딩, 파일 I/O 로직을 추가하지 마라. 새로운 기능은 반드시 FastAPI 백엔드에 추가하고, 프론트엔드에서는 API만 호출하라.

2. **API First Design:** 백엔드 코드를 작성할 때 단일 파일에 모든 코드를 넣지 마라. `routers/`, `services/`, `models/`, `repositories/` 디렉토리로 관심사를 분리하라.

3. **Graceful Degradation:** 백엔드 API가 아직 준비되지 않은 기능이라면, 기존 로직의 하위 호환성을 유지하라:

```javascript
async function callWithFallback(apiPath, fallbackFn, payload) {
  try {
    const res = await fetch(`http://localhost:8000${apiPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`FastAPI 호출 실패, 폴백 사용: ${err.message}`);
    if (IS_ELECTRON && window.aether[fallbackFn]) {
      return await window.aether[fallbackFn](payload);
    }
    return await fallbackFn(payload);
  }
}
```

4. **Data Structure Over Text:** 모든 API 입출력은 Pydantic 모델로 정의하라. 단순 `string` 대신 구조화된 스키마를 강제하라.

5. **현재 상태 존중:** Phase 1 진행 중에는 `index.html`의 기존 바닐라 JS 패턴을 유지하라. 아직 React로 전환하지 않는다. `IS_ELECTRON` 분기, `window.aether` API, localStorage 키 네이밍(`ae_` 접두사)을 그대로 따르라.

### 6.2 코드 품질 규칙

6. **타입 강제:** Python은 Pydantic v2 + 타입 힌트 필수. `Any` 타입 최소화.

7. **환경 분리:** 하드코딩된 URL, 포트, API 키 금지. `core/config.py`에서 `pydantic-settings`로 환경 변수 관리.

8. **로깅:** `print()` 사용 금지. Python 표준 `logging` 또는 `loguru` 사용. API 요청/응답과 에러는 구조화된 로그로 남긴다.

9. **테스트:** 새로운 `service` 레이어 함수에는 반드시 `pytest` 단위 테스트 작성. `tests/`에 모듈과 동일한 구조로 배치.

10. **기존 코드 수정 주의:** `index.html` 수정 시, 상단 minified CSS (대형 base64 아이콘)를 절대 건드리지 마라. JS는 `<body>` 하단 단일 `<script>` 블록 안에 있다.

### 6.3 AI/LLM 관련 규칙

11. **모델 추상화:** 특정 LLM에 직접 의존하지 마라. `services/llm_provider.py`에 추상 인터페이스를 두고 구현체를 교체 가능하게 설계하라.

12. **Ollama 폴백:** AI Orchestrator는 타임아웃(기본 30초) + 재시도(최대 2회) 로직을 포함. 모든 LLM 호출 실패 시 명확한 에러 메시지 반환.

13. **프롬프트 관리:** LLM 프롬프트를 코드 내에 하드코딩하지 마라. `prompts/` 디렉토리에 `.txt` 또는 `.jinja2`로 별도 관리.

14. **기존 AI 함수 호환:** Phase 1에서 `callLLM()`, `callLLMStream()`, `aiGen()`, `buildLoreContext()`의 시그니처를 변경할 때는, 기존 호출부가 깨지지 않도록 래퍼 함수를 유지하라.

---

## 7. API Versioning & Convention

- 모든 API 경로: `/api/v1/` 접두사
- 리소스명: 복수형 명사 (`/episodes`, `/characters`)
- Pydantic 모델 네이밍: `{Resource}Create`, `{Resource}Update`, `{Resource}Response`
- 페이지네이션: `?page=1&size=20`
- 스트리밍 응답: `/api/v1/generate/stream` — `text/event-stream` (SSE)

---

## 8. Security

- **Phase 1~2 (로컬):** CORS를 `localhost`로 제한. 별도 인증 없음. 기존 CSP 유지. FastAPI도 `connect-src http://localhost:*`에 포함됨.
- **Phase 3+ (원격 DB):** JWT 기반 인증을 FastAPI 미들웨어로 추가. DB 접속 정보는 환경 변수로만 관리.
- **모든 Phase:** 사용자 입력은 Pydantic으로 검증. SQL Injection, Prompt Injection 유의.

---

## 9. DevOps & 개발 환경

- **컨테이너:** `docker-compose.yml`로 FastAPI + ChromaDB 한 번에 실행
- **린트/포맷:** Python → `ruff`, JS → 기존 코드 스타일 유지 (Phase 4에서 ESLint + Prettier)
- **Git 전략:** `main` (안정) ← `develop` (통합) ← `feature/*` (기능별)
- **CI (향후):** GitHub Actions 테스트 + 린트
- **Electron Fiddle:** Phase 1~3에서 기존 빌드 워크플로우 유지 (`index.html` + `main.js` + `preload.js` + `renderer.js`)

---

## 10. 용어 사전 (Glossary)

| 용어 | 정의 |
|---|---|
| **Ontology** | 도메인 내 개념(엔티티)과 그 관계를 형식적으로 정의한 지식 체계 |
| **Strangler Fig** | 레거시를 한 번에 교체하지 않고, 새 서비스로 기능을 점진 이관하는 패턴 |
| **Thin Client** | UI 렌더링만 담당, 비즈니스 로직은 서버에 위임하는 설계 |
| **Polyglot Persistence** | 데이터 특성에 맞는 여러 DB를 혼용하는 전략 |
| **RAG** | Retrieval-Augmented Generation. 검색 결과를 LLM 컨텍스트로 제공하는 기법 |
| **Sidecar** | 메인 앱(Electron) 옆에서 독립 프로세스로 실행되는 보조 서비스(FastAPI) |
| **IS_ELECTRON** | `typeof window.aether !== 'undefined'` — 런타임 환경 감지 플래그 |
| **contextBridge** | Electron 보안 API. 렌더러에 네이티브 기능을 안전하게 노출하는 브릿지 |
| **SSE** | Server-Sent Events. 서버→클라이언트 단방향 스트리밍 프로토콜 |
