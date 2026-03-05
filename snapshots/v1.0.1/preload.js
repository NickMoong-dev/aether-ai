/**
 * Aether AI — preload.js
 * Logger + Backup + Feedback + What's New + Updater API
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('aether', {

  // ── 데이터 저장소 ─────────────────────────────────────────────
  loadProjects:  ()  => ipcRenderer.invoke('load-projects'),
  saveProjects:  (j) => ipcRenderer.invoke('save-projects', j),
  loadSettings:  ()  => ipcRenderer.invoke('load-settings'),
  saveSettings:  (j) => ipcRenderer.invoke('save-settings', j),
  loadEncy:      ()  => ipcRenderer.invoke('load-ency'),
  saveEncy:      (j) => ipcRenderer.invoke('save-ency', j),
  loadEncyEmbed: ()  => ipcRenderer.invoke('load-ency-embed'),
  saveEncyEmbed: (j) => ipcRenderer.invoke('save-ency-embed', j),
  loadWorldDict: ()  => ipcRenderer.invoke('load-world-dict'),
  saveWorldDict: (j) => ipcRenderer.invoke('save-world-dict', j),
  loadRevisions: ()  => ipcRenderer.invoke('load-revisions'),
  saveRevisions: (j) => ipcRenderer.invoke('save-revisions', j),
  loadSummaries: ()  => ipcRenderer.invoke('load-summaries'),
  saveSummaries: (j) => ipcRenderer.invoke('save-summaries', j),
  loadHistory:   ()  => ipcRenderer.invoke('load-history'),
  saveHistory:   (j) => ipcRenderer.invoke('save-history', j),

  // ── 파일 저장 ─────────────────────────────────────────────────
  saveFile:   (opts) => ipcRenderer.invoke('save-file-dialog', opts),
  printToPDF: (opts) => ipcRenderer.invoke('print-to-pdf', opts),

  // ── 창 제어 ───────────────────────────────────────────────────
  minimize:     () => ipcRenderer.send('win-minimize'),
  maximize:     () => ipcRenderer.send('win-maximize'),
  close:        () => ipcRenderer.send('win-close'),

  // ── 앱 정보 ───────────────────────────────────────────────────
  getAppInfo:   ()    => ipcRenderer.invoke('get-app-info'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openUserData: ()    => ipcRenderer.invoke('open-user-data'),

  // ══════════════════════════════════════════════════════════════
  // LOGGER
  // ══════════════════════════════════════════════════════════════
  log: {
    /** 로그 기록 (level: debug|info|warn|error) */
    write:   (level, msg) => ipcRenderer.send('log-write', { level, msg }),
    debug:   (msg)        => ipcRenderer.send('log-write', { level: 'debug', msg }),
    info:    (msg)        => ipcRenderer.send('log-write', { level: 'info',  msg }),
    warn:    (msg)        => ipcRenderer.send('log-write', { level: 'warn',  msg }),
    error:   (msg)        => ipcRenderer.send('log-write', { level: 'error', msg }),
    /** 로그 파일 목록 → [{name, size, filePath}] */
    list:    ()           => ipcRenderer.invoke('log-list'),
    /** 로그 파일 내용 (최근 N줄) */
    read:    (fileName, lines) => ipcRenderer.invoke('log-read', { fileName, lines }),
    /** 로그 내보내기 (저장 다이얼로그) */
    export:  (fileName)   => ipcRenderer.invoke('log-export', { fileName }),
    /** 로그 폴더 열기 */
    openDir: ()           => ipcRenderer.invoke('log-open-dir'),
  },

  // ══════════════════════════════════════════════════════════════
  // BACKUP
  // ══════════════════════════════════════════════════════════════
  backup: {
    /** 즉시 백업 → {success, filePath, size} */
    now:      ()              => ipcRenderer.invoke('backup-now'),
    /** 백업 목록 → [{name, size, mtime, filePath}] */
    list:     ()              => ipcRenderer.invoke('backup-list'),
    /** 백업 복원 → {success, version, createdAt} */
    restore:  (filePath)      => ipcRenderer.invoke('backup-restore', { filePath }),
    /** 백업 삭제 */
    delete:   (filePath)      => ipcRenderer.invoke('backup-delete', { filePath }),
    /** 백업 내보내기 (.aebak 파일로 저장) */
    export:   (filePath)      => ipcRenderer.invoke('backup-export', { filePath }),
    /** 외부 .aebak 가져와서 복원 */
    import:   ()              => ipcRenderer.invoke('backup-import'),
    /** 백업 폴더 열기 */
    openDir:  ()              => ipcRenderer.invoke('backup-open-dir'),
    /** 백업 완료 이벤트 수신 */
    onDone:   (fn)            => ipcRenderer.on('backup-done', (_e, r) => fn(r)),
  },

  // ══════════════════════════════════════════════════════════════
  // DISCORD FEEDBACK
  // ══════════════════════════════════════════════════════════════
  feedback: {
    /** Discord Webhook 전송 → {success, error?} */
    send: (webhookUrl, payload) => ipcRenderer.invoke('send-feedback', { webhookUrl, payload }),
  },

  // ══════════════════════════════════════════════════════════════
  // WHAT'S NEW
  // ══════════════════════════════════════════════════════════════
  whatsNew: {
    /** 릴리즈 노트 + 현재 버전 → {notes, current} */
    get:  () => ipcRenderer.invoke('whats-new-get'),
    /** 현재 버전 확인 완료 기록 */
    seen: () => ipcRenderer.invoke('whats-new-seen'),
  },

  // ══════════════════════════════════════════════════════════════
  // AUTO-UPDATER
  // ══════════════════════════════════════════════════════════════
  updater: {
    check:    ()  => ipcRenderer.invoke('updater-check'),
    download: ()  => ipcRenderer.invoke('updater-download'),
    install:  ()  => ipcRenderer.send('updater-install'),
    onStatus: (fn) => ipcRenderer.on('updater-status', (_e, p) => fn(p)),
    offStatus: ()  => ipcRenderer.removeAllListeners('updater-status'),
  },

  // ══════════════════════════════════════════════════════════════
  // AUTO-SETUP (Ollama + ComfyUI)
  // ══════════════════════════════════════════════════════════════
  setup: {
    ollama: {
      /** Ollama 상태 확인 → {installed, running, models[], path} */
      check:   ()      => ipcRenderer.invoke('setup-ollama-check'),
      /** Ollama 설치 (동의 다이얼로그 포함) */
      install: ()      => ipcRenderer.invoke('setup-ollama-install'),
      /** Ollama 서버 시작 */
      start:   ()      => ipcRenderer.invoke('setup-ollama-start'),
      /** 모델 pull → {success, model} */
      pull:    (model) => ipcRenderer.invoke('setup-ollama-pull', model),
      /** 전체 자동 설치: 설치 → 시작 → 기본 모델 다운로드 */
      fullSetup: ()    => ipcRenderer.invoke('setup-ollama-full'),
    },
    comfy: {
      /** ComfyUI 상태 확인 → {installed, running, path, models} */
      check:    ()           => ipcRenderer.invoke('setup-comfy-check'),
      /** ComfyUI 포터블 설치 (동의 다이얼로그 포함) */
      install:  ()           => ipcRenderer.invoke('setup-comfy-install'),
      /** ComfyUI 서버 시작 */
      start:    ()           => ipcRenderer.invoke('setup-comfy-start'),
      /** 모델 다운로드 (key: 'unet'|'clip1'|'clip2'|'vae', url: 다운로드 URL) */
      downloadModel: (key, url) => ipcRenderer.invoke('setup-comfy-model', { key, url }),
      /** 모델 URL 업데이트 */
      setModelUrl: (key, url)   => ipcRenderer.invoke('setup-comfy-set-model-url', { key, url }),
      /** 전체 자동 설치: 포터블 설치 → 서버 시작 */
      fullSetup: ()  => ipcRenderer.invoke('setup-comfy-full'),
    },
    /** 설치 진행률 이벤트 수신 → fn({stage, percent, message}) */
    onProgress:  (fn) => ipcRenderer.on('setup-progress', (_e, p) => fn(p)),
    offProgress: ()   => ipcRenderer.removeAllListeners('setup-progress'),
  },

  // ── main → renderer 이벤트 수신 ──────────────────────────────
  on: (channel, fn) => {
    const allowed = ['window-state', 'menu-action', 'updater-status',
                     'whats-new', 'log-line', 'backup-done', 'setup-progress']
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_e, ...args) => fn(...args))
    }
  },
  off: (channel) => ipcRenderer.removeAllListeners(channel),
})
