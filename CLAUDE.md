# Aether — AI-Powered Novel Writing Assistant

## Project Overview

**Aether** (에테르) is a Korean-language creative writing tool for managing novels and long-form fiction. It is delivered as a **single self-contained HTML file** (`index.html`) that runs in a browser or as an **Electron desktop app**.

## Architecture

- **Type**: Single-page application (single HTML file — all CSS, JS, and HTML inline)
- **Language**: JavaScript (vanilla, no build step), Korean UI
- **Runtime**: Browser (standalone) or Electron desktop app
- **Data persistence**:
  - Browser mode: `localStorage` (key prefix `ae_`)
  - Electron mode: native filesystem via `window.aether` contextBridge API (`preload.js`)

Runtime detection:
```js
const IS_ELECTRON = typeof window.aether !== 'undefined';
```

---

## Electron Fiddle Build Guide

Electron Fiddle에서 이 프로젝트를 빌드하려면 **4개의 파일**이 필요합니다:

```
├── index.html          ← Aether 단일 HTML 파일 (렌더러, 인라인 JS 포함)
├── main.js             ← Electron 메인 프로세스
├── preload.js          ← contextBridge로 window.aether API 노출
├── renderer.js         ← 렌더러 엔트리 (인라인 JS 보조, API 레퍼런스)
├── package.json        ← 앱 메타데이터 + electron-builder 설정
└── release-notes.json  ← What's New 릴리즈 노트
```

### 1. index.html

Aether의 단일 HTML 파일입니다. 모든 CSS와 JavaScript가 인라인으로 포함되어 있습니다.
- `window.aether`가 존재하면 Electron 모드로 동작 (네이티브 파일 I/O)
- `window.aether`가 없으면 자동으로 브라우저 모드로 폴백 (localStorage)

### 2. main.js — 메인 프로세스 요구사항

`main.js`에서 구현해야 할 항목:

#### BrowserWindow 설정

```js
const mainWindow = new BrowserWindow({
  width: 1400,
  height: 900,
  frame: false,                    // 커스텀 타이틀바 사용 (frameless)
  titleBarStyle: 'hidden',         // macOS: 네이티브 신호등 버튼 유지
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,        // 필수
    nodeIntegration: false,        // 필수 (보안)
  },
});

mainWindow.loadFile('index.html');
```

#### IPC 핸들러 (ipcMain.handle)

메인 프로세스에서 다음 IPC 채널에 대한 핸들러를 등록해야 합니다:

| IPC 채널 | 방향 | 설명 |
|---|---|---|
| `save-projects` | renderer → main | 프로젝트 JSON 저장 (파일시스템) |
| `load-projects` | renderer → main | 프로젝트 JSON 로드 |
| `save-settings` | renderer → main | 통합 설정 JSON 저장 |
| `load-settings` | renderer → main | 통합 설정 JSON 로드 |
| `save-ency` | renderer → main | 백과사전 항목 JSON 저장 |
| `load-ency` | renderer → main | 백과사전 항목 JSON 로드 |
| `save-ency-embed` | renderer → main | 임베딩 벡터 JSON 저장 |
| `load-ency-embed` | renderer → main | 임베딩 벡터 JSON 로드 |
| `save-history` | renderer → main | 휴지통/취소 이력 JSON 저장 |
| `load-history` | renderer → main | 휴지통/취소 이력 JSON 로드 |
| `save-world-dict` | renderer → main | 세계사전 JSON 저장 |
| `load-world-dict` | renderer → main | 세계사전 JSON 로드 |
| `save-revisions` | renderer → main | 수정 이력 JSON 저장 |
| `load-revisions` | renderer → main | 수정 이력 JSON 로드 |
| `save-summaries` | renderer → main | 에피소드 요약 JSON 저장 |
| `load-summaries` | renderer → main | 에피소드 요약 JSON 로드 |
| `get-app-info` | renderer → main | 앱 정보 반환 `{ version, platform, electron }` |
| `print-to-pdf` | renderer → main | HTML → PDF 변환 (별도 BrowserWindow 사용) |
| `save-file` | renderer → main | 네이티브 파일 저장 다이얼로그 `{ defaultName, ext, b64 }` |
| `window-minimize` | renderer → main | 창 최소화 |
| `window-maximize` | renderer → main | 창 최대화/복원 토글 |
| `window-close` | renderer → main | 창 닫기 |

#### IPC 이벤트 (ipcMain → renderer, webContents.send)

메인 프로세스에서 렌더러로 보내는 이벤트:

| 이벤트 | 페이로드 | 설명 |
|---|---|---|
| `window-state` | `'maximized'` \| `'unmaximized'` | 창 상태 변경 시 |
| `menu-action` | `string` | 메뉴 클릭 시 (`'new-project'`, `'export'`, `'find-replace'`, `'whats-new'`, `'feedback'`, `'log-viewer'`) |
| `whats-new` | `{ notes: string }` | What's New 자동 팝업 |
| `backup-done` | `{ success: boolean }` | 자동 백업 완료 알림 |
| `log-line` | `{ level, ts, msg }` | 실시간 로그 스트림 |

#### Auto-Setup IPC 핸들러 (Ollama + ComfyUI 자동 설치)

| IPC 채널 | 설명 |
|---|---|
| `setup-ollama-check` | Ollama 상태 확인 → `{ installed, running, models[], path }` |
| `setup-ollama-install` | Ollama 다운로드+설치 (동의 다이얼로그 포함) |
| `setup-ollama-start` | Ollama 서비스 시작 (`OLLAMA_ORIGINS=*`) |
| `setup-ollama-pull` | 모델 다운로드 (예: `llama3.2`) |
| `setup-ollama-full` | 전체 자동 설치: 설치 → 시작 → 기본 모델 pull |
| `setup-comfy-check` | ComfyUI 상태 확인 → `{ installed, running, path, models }` |
| `setup-comfy-install` | ComfyUI 포터블 다운로드+압축 해제 (동의 다이얼로그 포함) |
| `setup-comfy-start` | ComfyUI 서버 시작 (`--enable-cors-header`) |
| `setup-comfy-model` | 모델 파일 다운로드 `{ key, url }` |
| `setup-comfy-full` | 전체 자동 설치: 포터블 설치 → 서버 시작 |
| `setup-comfy-set-model-url` | 모델 URL 업데이트 `{ key, url }` |

| 이벤트 | 페이로드 | 설명 |
|---|---|---|
| `setup-progress` | `{ stage, percent, message }` | 설치 진행률 실시간 전송 |

#### 선택적 IPC 핸들러 (고급 기능)

아래 기능은 없어도 앱의 핵심 기능은 동작합니다:

| IPC 채널 그룹 | 설명 |
|---|---|
| `log-list`, `log-read`, `log-export`, `log-open-dir` | 로그 뷰어 |
| `backup-list`, `backup-now`, `backup-restore`, `backup-delete`, `backup-export`, `backup-import`, `backup-open-dir` | 자동 백업 관리 |
| `feedback-send` | Discord 웹훅을 통한 피드백 전송 |
| `whats-new-get`, `whats-new-seen` | 업데이트 내역 표시 |

#### 데이터 파일 저장 위치 (권장)

```js
const { app } = require('electron');
const dataDir = path.join(app.getPath('userData'), 'data');
// 예: %APPDATA%/aether/data/ (Windows)
//     ~/Library/Application Support/aether/data/ (macOS)
```

권장 파일 구조:
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

### 3. preload.js — contextBridge API 명세

`preload.js`는 `contextBridge.exposeInMainWorld('aether', { ... })`로 아래 API를 노출해야 합니다:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aether', {
  // ── 데이터 저장/로드 ──
  saveProjects:   (payload) => ipcRenderer.invoke('save-projects', payload),
  loadProjects:   ()        => ipcRenderer.invoke('load-projects'),
  saveSettings:   (payload) => ipcRenderer.invoke('save-settings', payload),
  loadSettings:   ()        => ipcRenderer.invoke('load-settings'),
  saveEncy:       (json)    => ipcRenderer.invoke('save-ency', json),
  loadEncy:       ()        => ipcRenderer.invoke('load-ency'),
  saveEncyEmbed:  (json)    => ipcRenderer.invoke('save-ency-embed', json),
  loadEncyEmbed:  ()        => ipcRenderer.invoke('load-ency-embed'),
  saveHistory:    (json)    => ipcRenderer.invoke('save-history', json),
  loadHistory:    ()        => ipcRenderer.invoke('load-history'),
  saveWorldDict:  (payload) => ipcRenderer.invoke('save-world-dict', payload),
  loadWorldDict:  ()        => ipcRenderer.invoke('load-world-dict'),
  saveRevisions:  (payload) => ipcRenderer.invoke('save-revisions', payload),
  loadRevisions:  ()        => ipcRenderer.invoke('load-revisions'),
  saveSummaries:  (payload) => ipcRenderer.invoke('save-summaries', payload),
  loadSummaries:  ()        => ipcRenderer.invoke('load-summaries'),

  // ── 파일 작업 ──
  printToPDF:  (opts)  => ipcRenderer.invoke('print-to-pdf', opts),
  saveFile:    (opts)  => ipcRenderer.invoke('save-file', opts),

  // ── 앱 정보 & 창 제어 ──
  getAppInfo:  ()  => ipcRenderer.invoke('get-app-info'),
  minimize:    ()  => ipcRenderer.invoke('window-minimize'),
  maximize:    ()  => ipcRenderer.invoke('window-maximize'),
  close:       ()  => ipcRenderer.invoke('window-close'),

  // ── IPC 이벤트 리스너 ──
  on: (channel, handler) => {
    const allowed = ['window-state', 'menu-action', 'whats-new', 'backup-done', 'log-line'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => handler(...args));
    }
  },

  // ── 로그 뷰어 (선택) ──
  log: {
    list:    ()              => ipcRenderer.invoke('log-list'),
    read:    (file, lines)   => ipcRenderer.invoke('log-read', file, lines),
    export:  (file)          => ipcRenderer.invoke('log-export', file),
    openDir: ()              => ipcRenderer.invoke('log-open-dir'),
  },

  // ── 백업 관리 (선택) ──
  backup: {
    list:    ()          => ipcRenderer.invoke('backup-list'),
    now:     ()          => ipcRenderer.invoke('backup-now'),
    restore: (filePath)  => ipcRenderer.invoke('backup-restore', filePath),
    delete:  (filePath)  => ipcRenderer.invoke('backup-delete', filePath),
    export:  (filePath)  => ipcRenderer.invoke('backup-export', filePath),
    import:  ()          => ipcRenderer.invoke('backup-import'),
    openDir: ()          => ipcRenderer.invoke('backup-open-dir'),
  },

  // ── 피드백 (선택) ──
  feedback: {
    send: (webhook, payload) => ipcRenderer.invoke('feedback-send', webhook, payload),
  },

  // ── What's New (선택) ──
  whatsNew: {
    get:  () => ipcRenderer.invoke('whats-new-get'),
    seen: () => ipcRenderer.invoke('whats-new-seen'),
  },
});
```

### 4. Electron Fiddle 빠른 시작

1. **Electron Fiddle** 실행
2. **main.js** 탭에 메인 프로세스 코드 작성 (위 명세 참고)
3. **preload.js** 탭에 위의 `contextBridge` 코드 붙여넣기
4. **index.html** 탭에 `index (5).html` 내용 붙여넣기 (또는 파일 임포트)
5. **Run** 클릭

> **최소 실행**: `main.js`에 BrowserWindow + 창 제어 IPC 3개 + `get-app-info`만 구현하면 앱이 실행됩니다. 데이터 저장 IPC가 없으면 자동으로 localStorage 폴백이 동작합니다(단, `window.aether`가 정의되지 않아야 합니다).

> **주의**: `preload.js`에서 `window.aether`를 등록하면 `IS_ELECTRON === true`가 되어 모든 저장/로드가 IPC를 통해 시도됩니다. 따라서 `preload.js`에 등록한 모든 메서드에 대해 `main.js`에서 핸들러를 반드시 구현해야 합니다.

### 5. 커스텀 타이틀바

- 앱은 **frameless window** (`frame: false`)를 사용하며 HTML 내에 커스텀 타이틀바를 포함합니다
- 타이틀바 높이: `36px` (CSS 변수 `--titlebar-height`)
- macOS에서는 `body.platform-darwin` 클래스가 추가되어 네이티브 신호등 버튼 영역(72px)을 확보하고, 커스텀 창 제어 버튼을 숨깁니다
- `window-state` 이벤트로 최대화/복원 아이콘을 전환합니다 (`□` ↔ `❐`)
- 타이틀바의 `-webkit-app-region: drag` CSS로 창 드래그 가능

`getAppInfo()` 반환값 예시:
```js
{
  version: '1.0.0',        // package.json version
  platform: 'win32',       // process.platform ('win32' | 'darwin' | 'linux')
  electron: '28.0.0',      // process.versions.electron
}
```

### 6. PDF 내보내기 구현 (`print-to-pdf`)

렌더러에서 `{ html, pageSize }` 객체를 전달합니다. 메인 프로세스에서:

```js
ipcMain.handle('print-to-pdf', async (event, { html, pageSize }) => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const pageSizes = { a4: 'A4', a5: 'A5', b6: 'B6', pocket: 'A6' };
  const pdf = await win.webContents.printToPDF({
    pageSize: pageSizes[pageSize] || 'A5',
    printBackground: true,
  });
  win.destroy();
  // 네이티브 저장 다이얼로그로 PDF 저장
  const { dialog } = require('electron');
  const { filePath } = await dialog.showSaveDialog({ defaultPath: 'novel.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (filePath) {
    require('fs').writeFileSync(filePath, pdf);
    return { success: true };
  }
  return { success: false, error: '취소됨' };
});
```

### 7. 파일 저장 구현 (`save-file`)

렌더러에서 `{ defaultName, ext, b64 }` 객체를 전달합니다 (base64 인코딩된 파일 데이터):

```js
ipcMain.handle('save-file', async (event, { defaultName, ext, b64 }) => {
  const { dialog } = require('electron');
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (filePath) {
    require('fs').writeFileSync(filePath, Buffer.from(b64, 'base64'));
    return { success: true, filePath };
  }
  return { success: false };
});
```

---

## AI Integrations (Local Only)

All AI features call **local** services — no cloud API keys required.

### Ollama (LLM)
- **Default URL**: `http://localhost:11434`
- **Default model**: `llama3.2` (supports any installed model: gemma3, qwen2.5, etc.)
- **Embedding model**: `nomic-embed-text` (used for RAG/lorebook)
- **CORS requirement**: start Ollama with `OLLAMA_ORIGINS=* ollama serve`
- Used for: AI chat, brainstorming, character analysis, relation analysis, cover prompt generation, document expansion, episode summarization, episode suggestions, encyclopedia indexing

### ComfyUI (Image Generation)
- **Default URL**: `http://localhost:8188`
- **Model**: NewBie-Image-Exp0.1 (anime-style, AuraFlow architecture)
- **Required launch flag**: `--enable-cors-header`
- Used for: character portrait generation, book cover image generation
- Model files expected under `ComfyUI/models/`:
  - `diffusion_models/` — UNet (default: `NewBie-Image-Exp0.1-bf16.safetensors`)
  - `clip/` — CLIP 1 (default: `gemma_3_4b_it_bf16.safetensors`)
  - `clip/` — CLIP 2 (default: `jina_clip_v2_bf16.safetensors`)
  - `vae/` — VAE (default: `ae.safetensors`)

## Key Features

| Feature | Description |
|---|---|
| Project Library | Grid of novel projects with generated/custom book covers (Canvas API) |
| Episode Editor | Full-text editor with autosave, word count, episode status tracking |
| Character Manager | Character sheets with portraits, tags, relationships |
| Relationship Map | Visual canvas showing character relationships |
| Brainstorming Panel | AI-powered idea generation modes (plot, character, scene, etc.) |
| RAG Encyclopedia | Lorebook with embedding-based semantic search (nomic-embed-text) |
| World Dictionary | Categorized world-building entries (places, items, factions, etc.) |
| Document Editor | Outline + AI expansion for each episode |
| Episode Summarizer | Summarizes episodes to reduce LLM context usage |
| Revision History | Auto-snapshots and manual saves per episode |
| Cover Studio | Book cover designer with style presets + ComfyUI generation |
| Export | TXT, PDF, EPUB 내보내기; 권별 내보내기 지원 |
| AI Chat | Sidebar AI chat with lorebook context injection |
| Focus Mode | Distraction-free writing mode |
| Dark / Light theme | Toggle via settings |
| Update Checker | Background check against remote version manifest |

## Data Storage Keys (localStorage — Browser mode)

| Key | Contents |
|---|---|
| `ae_projects_v1` | All projects, episodes, characters, relationships, settings |
| `ae_ency_v1` | RAG encyclopedia entries |
| `ae_ency_embed_v1` | Embedding vectors for encyclopedia entries |
| `ae_api_settings` | API settings (Ollama URL/model, ComfyUI URL/model paths) |
| `ae_revisions_v1` | Episode revision history |
| `ae_summaries_v1` | Episode AI summaries |
| `ae_history_v1` | Undo/trash history |
| `ae_wdict_v1` | World dictionary |
| `ae_ollama_ok` | Cached Ollama connection status |
| `ae_comfy_ok` | Cached ComfyUI connection status |
| `ae_last_upd_check` | Timestamp of last update check |
| `ae_editor_fmt` | Editor formatting settings |
| `ae_upd_settings` | Update settings |
| `ae_theme` | Current theme (`dark` / `light`) |

## Core JavaScript Functions

- `callLLM(messages, system, maxTokens)` — Non-streaming or streaming LLM call to Ollama (stream 설정에 따라 자동 분기)
- `callLLMStream(messages, system, maxTokens, onToken, onDone)` — Streaming LLM with token callbacks
- `aiGen(type)` — AI text generation with lorebook context injection into the editor
- `buildLoreContext(queryText)` — Retrieves top-K encyclopedia entries via cosine similarity
- `saveData()` / `loadData()` — Project persistence (Electron or localStorage)
- `saveAllSettings()` / `loadAllSettings()` — 통합 설정 저장/로드 (Electron에서는 단일 settings.json)
- `renderHome()` — Renders project library grid
- `openProject(id)` — Switches to project editor view
- `initApp()` — Application bootstrap (loads all data, sets up Electron IPC listeners)

## Supported Genres

판타지, 현대 판타지, 로맨스, 로맨스 판타지, SF, 무협, 공포, 미스터리, 현대

## Fonts

- **Noto Serif KR** — body/editor text
- **Cinzel** — titles/headings
- **Noto Sans KR** — UI elements

Loaded from Google Fonts.

## Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob:;
connect-src 'self' http://localhost:* ws://localhost:*;
```

All external connections (Ollama, ComfyUI) must be on `localhost`.

## Development Notes

- **No build step** — the project is a single HTML file; edit it directly
- **No dependencies** — no npm, no bundler, no framework
- **Testing**: open `index.html` in a browser; Ollama/ComfyUI must be running for AI features
- When modifying the file, be careful with the minified CSS at the top of `<head>` — it is a large base64-encoded icon followed by inline styles
- All JavaScript is in a single `<script>` block at the bottom of `<body>`
- The HTML structure follows a modal-heavy pattern: most panels are `<div class="modal-overlay">` elements toggled with `.show` class
- Electron 모드와 브라우저 모드는 `IS_ELECTRON` 플래그로 분기되며, 기능 차이가 있음 (PDF 내보내기, 파일 저장, 백업 등은 Electron 전용)
