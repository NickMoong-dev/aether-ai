/**
 * Aether AI — Main Process
 * Electron v40 + electron-updater + Logger + Backup + Feedback + What's New
 */

const {
  app, BrowserWindow, ipcMain, dialog, shell, Menu,
} = require('electron')
const path  = require('path')
const fs    = require('fs')
const zlib  = require('zlib')  // 내장 모듈 — 백업 압축용
const { exec, execSync, spawn } = require('child_process')
const https = require('https')
const http  = require('http')

// ── electron-updater (패키징 앱에서만) ──────────────────────────────
let autoUpdater = null
if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload         = false
    autoUpdater.autoInstallOnAppQuit = false
  } catch (e) {
    console.warn('[Aether] electron-updater 로드 실패:', e.message)
  }
}

// ══════════════════════════════════════════════════════════════════
// 경로 상수
// ══════════════════════════════════════════════════════════════════
const USER_DATA       = app.getPath('userData')
const PROJECTS_FILE   = path.join(USER_DATA, 'projects.json')
const SETTINGS_FILE   = path.join(USER_DATA, 'settings.json')
const ENCY_FILE       = path.join(USER_DATA, 'encyclopedia.json')
const ENCY_EMB_FILE   = path.join(USER_DATA, 'ency_embeddings.json')
const WORLD_FILE      = path.join(USER_DATA, 'world_dict.json')
const REVISIONS_FILE  = path.join(USER_DATA, 'revisions.json')
const SUMMARIES_FILE  = path.join(USER_DATA, 'summaries.json')
const HISTORY_FILE    = path.join(USER_DATA, 'history.json')
const APP_META_FILE   = path.join(USER_DATA, 'app-meta.json')   // What's New용
const LOG_DIR         = path.join(USER_DATA, 'logs')
const BACKUP_DIR      = path.join(USER_DATA, 'backups')

// ── 로컬 AI 설치 디렉토리 ──
const SETUP_DIR       = path.join(USER_DATA, 'local-ai')
const COMFY_ROOT      = path.join(SETUP_DIR, 'ComfyUI')
const SEVEN_ZIP_EXE   = path.join(SETUP_DIR, '7zr.exe')

// Ollama 설치 URL (Windows)
const OLLAMA_INSTALLER_URL = 'https://ollama.com/download/OllamaSetup.exe'
const OLLAMA_DEFAULT_MODELS = ['llama3.2', 'nomic-embed-text']

// ComfyUI GitHub 릴리즈 API
const COMFY_RELEASES_API = 'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest'
const COMFY_ASSET_PATTERN = /ComfyUI_windows_portable.*\.7z$/i

// ComfyUI 모델 다운로드 URL (HuggingFace)
// ※ 모델 URL은 실제 호스팅 위치에 맞게 수정하세요
const COMFY_MODEL_DEFS = {
  unet:  { filename: 'NewBie-Image-Exp0.1-bf16.safetensors', subdir: 'models/diffusion_models', label: 'UNet (NewBie-Image-Exp0.1)', size: '~12 GB', url: '' },
  clip1: { filename: 'gemma_3_4b_it_bf16.safetensors',       subdir: 'models/clip',             label: 'CLIP 1 (Gemma 3 4B IT)',     size: '~8 GB',  url: '' },
  clip2: { filename: 'jina_clip_v2_bf16.safetensors',         subdir: 'models/clip',             label: 'CLIP 2 (Jina CLIP v2)',      size: '~1 GB',  url: '' },
  vae:   { filename: 'ae.safetensors',                        subdir: 'models/vae',              label: 'VAE (AuraFlow AE)',          size: '~320 MB', url: '' },
}

// 7-Zip 독립 실행 파일 (7z 압축 해제용)
const SEVEN_ZIP_URL = 'https://www.7-zip.org/a/7zr.exe'

if (!fs.existsSync(SETUP_DIR)) fs.mkdirSync(SETUP_DIR, { recursive: true })

// 모든 데이터 파일 목록 (백업 대상)
const DATA_FILES = {
  projects:        PROJECTS_FILE,
  settings:        SETTINGS_FILE,
  encyclopedia:    ENCY_FILE,
  ency_embeddings: ENCY_EMB_FILE,
  world_dict:      WORLD_FILE,
  revisions:       REVISIONS_FILE,
  summaries:       SUMMARIES_FILE,
  history:         HISTORY_FILE,
}

;[USER_DATA, LOG_DIR, BACKUP_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
})

// ══════════════════════════════════════════════════════════════════
// LOGGER
// ══════════════════════════════════════════════════════════════════
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const LOG_MAX_FILES = 7   // 최대 보관 일수

let _logStream   = null
let _logDate     = ''
let _logFilePath = ''

function getLogFilePath(dateStr) {
  return path.join(LOG_DIR, `aether-${dateStr}.log`)
}

function openLogStream() {
  const today = new Date().toISOString().slice(0, 10)
  if (_logDate === today && _logStream) return

  _logStream?.end()
  _logDate     = today
  _logFilePath = getLogFilePath(today)
  _logStream   = fs.createWriteStream(_logFilePath, { flags: 'a', encoding: 'utf-8' })

  // 오래된 로그 삭제
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith('aether-') && f.endsWith('.log'))
      .sort()
    if (files.length > LOG_MAX_FILES) {
      files.slice(0, files.length - LOG_MAX_FILES).forEach(f =>
        fs.unlinkSync(path.join(LOG_DIR, f))
      )
    }
  } catch {}
}

function writeLog(level, ...args) {
  try {
    openLogStream()
    const ts  = new Date().toISOString()
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
    const line = `[${ts}] [${level.toUpperCase().padEnd(5)}] ${msg}\n`
    _logStream?.write(line)
    // main 콘솔에도 출력
    if (level === 'error') console.error(line.trim())
    else if (level === 'warn')  console.warn(line.trim())
    else console.log(line.trim())
    // renderer에 실시간 전송
    mainWin?.webContents?.send('log-line', { level, ts, msg })
  } catch {}
}

const logger = {
  debug: (...a) => writeLog('debug', ...a),
  info:  (...a) => writeLog('info',  ...a),
  warn:  (...a) => writeLog('warn',  ...a),
  error: (...a) => writeLog('error', ...a),
}

// ══════════════════════════════════════════════════════════════════
// AUTO BACKUP
// ══════════════════════════════════════════════════════════════════
const BACKUP_MAX      = 20    // 최대 보관 개수
let   _backupTimer    = null
let   _backupDirtyFlag = false   // 데이터 변경 여부

/**
 * 데이터 파일들을 하나의 JSON 번들로 묶어 gzip 압축 후 저장
 * 형식: backups/backup-2025-01-01T12-00-00.aebak
 */
async function runBackup(reason = 'auto') {
  try {
    const bundle = { version: app.getVersion(), createdAt: Date.now(), reason, data: {} }

    for (const [key, filePath] of Object.entries(DATA_FILES)) {
      if (fs.existsSync(filePath)) {
        try { bundle.data[key] = JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
        catch { bundle.data[key] = null }
      }
    }

    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const outPath  = path.join(BACKUP_DIR, `backup-${ts}.aebak`)
    const json     = JSON.stringify(bundle)
    const compressed = zlib.gzipSync(Buffer.from(json, 'utf-8'), { level: 6 })
    fs.writeFileSync(outPath, compressed)

    logger.info(`[Backup] 저장 완료: ${path.basename(outPath)} (${(compressed.length/1024).toFixed(1)} KB, reason=${reason})`)

    // 오래된 백업 삭제
    pruneBackups()
    _backupDirtyFlag = false
    return { success: true, filePath: outPath, size: compressed.length }
  } catch (e) {
    logger.error('[Backup] 실패:', e.message)
    return { success: false, error: e.message }
  }
}

function pruneBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.aebak'))
      .sort()
    if (files.length > BACKUP_MAX) {
      files.slice(0, files.length - BACKUP_MAX).forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f))
        logger.debug('[Backup] 오래된 백업 삭제:', f)
      })
    }
  } catch {}
}

function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.aebak'))
      .sort()
      .reverse()
      .map(f => {
        const full = path.join(BACKUP_DIR, f)
        const stat = fs.statSync(full)
        return { name: f, size: stat.size, mtime: stat.mtimeMs, filePath: full }
      })
  } catch { return [] }
}

function restoreBackup(filePath) {
  try {
    const compressed = fs.readFileSync(filePath)
    const json       = zlib.gunzipSync(compressed).toString('utf-8')
    const bundle     = JSON.parse(json)

    for (const [key, data] of Object.entries(bundle.data || {})) {
      const dest = DATA_FILES[key]
      if (dest && data !== null) {
        fs.writeFileSync(dest, JSON.stringify(data), 'utf-8')
      }
    }
    logger.info('[Backup] 복원 완료:', path.basename(filePath))
    return { success: true, version: bundle.version, createdAt: bundle.createdAt }
  } catch (e) {
    logger.error('[Backup] 복원 실패:', e.message)
    return { success: false, error: e.message }
  }
}

// 데이터 변경 감지 → 디바운스 자동 백업 (기본 30분)
function scheduleAutoBackup(intervalMs = 30 * 60 * 1000) {
  clearTimeout(_backupTimer)
  _backupTimer = setTimeout(async () => {
    if (_backupDirtyFlag) await runBackup('auto-timer')
    scheduleAutoBackup(intervalMs)
  }, intervalMs)
}

// ══════════════════════════════════════════════════════════════════
// WHAT'S NEW — 앱 메타 (마지막 확인 버전 기록)
// ══════════════════════════════════════════════════════════════════
function readAppMeta() {
  try {
    if (fs.existsSync(APP_META_FILE)) return JSON.parse(fs.readFileSync(APP_META_FILE, 'utf-8'))
  } catch {}
  return {}
}

function writeAppMeta(data) {
  try {
    const current = readAppMeta()
    fs.writeFileSync(APP_META_FILE, JSON.stringify({ ...current, ...data }), 'utf-8')
  } catch {}
}

function getReleaseNotes() {
  // 번들된 release-notes.json 읽기 (__dirname = 앱 루트)
  try {
    const notesPath = path.join(__dirname, 'release-notes.json')
    if (fs.existsSync(notesPath)) return JSON.parse(fs.readFileSync(notesPath, 'utf-8'))
  } catch {}
  return []
}

// ══════════════════════════════════════════════════════════════════
// BrowserWindow
// ══════════════════════════════════════════════════════════════════
let mainWin = null

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    titleBarStyle:   process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    frame:           process.platform !== 'darwin',
    titleBarOverlay: process.platform === 'win32'
      ? { color: '#0e0b14', symbolColor: '#b89cf5', height: 36 } : false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      webSecurity:      true,
    },
    backgroundColor: '#0e0b14',
    show: false,
  })

  mainWin.loadFile('index.html')
  logger.info(`[App] 시작 v${app.getVersion()} | Electron ${process.versions.electron} | ${process.platform}`)

  mainWin.once('ready-to-show', () => {
    mainWin.show()
    if (autoUpdater) {
      setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000)
    }
    // What's New 체크 → renderer로 전송
    setTimeout(() => checkWhatsNew(), 1500)
  })

  mainWin.on('maximize',   () => mainWin.webContents.send('window-state', 'maximized'))
  mainWin.on('unmaximize', () => mainWin.webContents.send('window-state', 'normal'))
  mainWin.on('closed',     () => { mainWin = null })
}

function checkWhatsNew() {
  const meta    = readAppMeta()
  const current = app.getVersion()
  const notes   = getReleaseNotes()
  // 새 버전이거나 처음 실행인 경우
  if (meta.lastSeenVersion !== current && notes.length > 0) {
    const newNotes = notes.filter(n => !meta.lastSeenVersion || compareVersions(n.version, meta.lastSeenVersion) > 0)
    if (newNotes.length > 0) {
      mainWin?.webContents.send('whats-new', { notes: newNotes, current })
    }
  }
}

// 단순 semver 비교 (1.2.3 형식)
function compareVersions(a, b) {
  const pa = a.replace(/^v/,'').split('.').map(Number)
  const pb = b.replace(/^v/,'').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i]||0) > (pb[i]||0)) return 1
    if ((pa[i]||0) < (pb[i]||0)) return -1
  }
  return 0
}

// ══════════════════════════════════════════════════════════════════
// 앱 생명주기
// ══════════════════════════════════════════════════════════════════
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  setupUpdater()
  setupIPC()
  createWindow()
  Menu.setApplicationMenu(buildAppMenu())
  scheduleAutoBackup()
})

// 종료 직전 백업
app.on('before-quit', async (e) => {
  e.preventDefault()
  logger.info('[App] 종료 전 백업 실행')
  await runBackup('quit')
  _logStream?.end()
  app.exit(0)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ══════════════════════════════════════════════════════════════════
// Auto-Updater
// ══════════════════════════════════════════════════════════════════
function setupUpdater() {
  if (!autoUpdater) return
  const send = (status, payload = {}) => {
    mainWin?.webContents.send('updater-status', { status, ...payload })
  }
  autoUpdater.on('checking-for-update',  ()     => send('checking'))
  autoUpdater.on('update-available',     (info) => send('available',    { version: info.version, releaseNotes: info.releaseNotes ?? '' }))
  autoUpdater.on('update-not-available', (info) => send('not-available', { version: info.version }))
  autoUpdater.on('download-progress',    (prog) => send('downloading',  { percent: Math.round(prog.percent), bytesPerSecond: prog.bytesPerSecond, total: prog.total }))
  autoUpdater.on('update-downloaded',    (info) => {
    logger.info(`[Updater] 다운로드 완료: v${info.version}`)
    send('downloaded', { version: info.version, releaseNotes: info.releaseNotes ?? '' })
  })
  autoUpdater.on('error', (err) => {
    logger.error('[Updater] 오류:', err.message)
    send('error', { message: err.message })
  })
}

// ══════════════════════════════════════════════════════════════════
// 보안 유틸 — 경로 트래버설 방지
// ══════════════════════════════════════════════════════════════════

/** path.resolve 후 baseDir 내부에 있는지 엄격 검증 */
function isSafePath(baseDir, targetPath) {
  const resolved = path.resolve(targetPath)
  const base     = path.resolve(baseDir) + path.sep
  return resolved.startsWith(base) || resolved === path.resolve(baseDir)
}

/** fileName을 baseDir에 조인한 뒤 경로 트래버설 검증 */
function safeJoin(baseDir, fileName) {
  const joined = path.join(baseDir, fileName)
  if (!isSafePath(baseDir, joined)) return null
  return joined
}

// ══════════════════════════════════════════════════════════════════
// 파일 I/O 헬퍼
// ══════════════════════════════════════════════════════════════════
function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf-8')
  } catch (e) {
    logger.error('[IO] readJSON:', e.message)
    return null
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, data, 'utf-8')
    _backupDirtyFlag = true   // 데이터 변경 감지
    return true
  } catch (e) {
    logger.error('[IO] writeJSON:', e.message)
    return false
  }
}

// ══════════════════════════════════════════════════════════════════
// IPC 핸들러
// ══════════════════════════════════════════════════════════════════
function setupIPC() {

  // ── 데이터 저장소 ─────────────────────────────────────────────
  ipcMain.handle('load-projects',      ()      => readJSON(PROJECTS_FILE))
  ipcMain.handle('save-projects',      (_,j)   => writeJSON(PROJECTS_FILE, j))
  ipcMain.handle('load-settings',      ()      => readJSON(SETTINGS_FILE))
  ipcMain.handle('save-settings',      (_,j)   => writeJSON(SETTINGS_FILE, j))
  ipcMain.handle('load-ency',          ()      => readJSON(ENCY_FILE))
  ipcMain.handle('save-ency',          (_,j)   => writeJSON(ENCY_FILE, j))
  ipcMain.handle('load-ency-embed',    ()      => readJSON(ENCY_EMB_FILE))
  ipcMain.handle('save-ency-embed',    (_,j)   => writeJSON(ENCY_EMB_FILE, j))
  ipcMain.handle('load-world-dict',    ()      => readJSON(WORLD_FILE))
  ipcMain.handle('save-world-dict',    (_,j)   => writeJSON(WORLD_FILE, j))
  ipcMain.handle('load-revisions',     ()      => readJSON(REVISIONS_FILE))
  ipcMain.handle('save-revisions',     (_,j)   => writeJSON(REVISIONS_FILE, j))
  ipcMain.handle('load-summaries',     ()      => readJSON(SUMMARIES_FILE))
  ipcMain.handle('save-summaries',     (_,j)   => writeJSON(SUMMARIES_FILE, j))
  ipcMain.handle('load-history',       ()      => readJSON(HISTORY_FILE))
  ipcMain.handle('save-history',       (_,j)   => writeJSON(HISTORY_FILE, j))

  // ── 파일 저장 ─────────────────────────────────────────────────
  ipcMain.handle('save-file-dialog', async (_, { defaultName, ext, b64 }) => {
    const extMap = {
      epub:[{name:'EPUB 전자책',extensions:['epub']}], docx:[{name:'Word 문서',extensions:['docx']}],
      html:[{name:'HTML',extensions:['html']}],        txt: [{name:'텍스트',extensions:['txt']}],
      md:  [{name:'Markdown',extensions:['md']}],      pdf: [{name:'PDF',extensions:['pdf']}],
    }
    const result = await dialog.showSaveDialog(mainWin, {
      defaultPath: defaultName, filters: extMap[ext] || [{name:'모든 파일',extensions:['*']}],
    })
    if (result.canceled || !result.filePath) return { success: false }
    try {
      fs.writeFileSync(result.filePath, Buffer.from(b64, 'base64'))
      logger.info(`[Export] 파일 저장: ${result.filePath}`)
      return { success: true, filePath: result.filePath }
    } catch (e) { return { success: false, error: e.message } }
  })

  // ── PDF ───────────────────────────────────────────────────────
  ipcMain.handle('print-to-pdf', async (_, { html, pageSize }) => {
    const sizeMap = { a4:{w:794,h:1123}, a5:{w:559,h:794}, b6:{w:481,h:680}, pocket:{w:396,h:559} }
    const ps = sizeMap[pageSize] || sizeMap.a5
    const pdfWin = new BrowserWindow({ show:false, webPreferences:{contextIsolation:true,nodeIntegration:false} })
    try {
      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      await new Promise(r => setTimeout(r, 400))
      const data = await pdfWin.webContents.printToPDF({
        pageSize: { width: ps.w*1000, height: ps.h*1000 }, printBackground: true,
        margins: { top:10, bottom:10, left:12, right:12 },
      })
      pdfWin.destroy()
      const result = await dialog.showSaveDialog(mainWin, { defaultPath:'novel.pdf', filters:[{name:'PDF',extensions:['pdf']}] })
      if (result.canceled) return { success: false }
      fs.writeFileSync(result.filePath, data)
      return { success: true, filePath: result.filePath }
    } catch (e) {
      logger.error('[PDF] 변환 실패:', e.message)
      return { success: false, error: e.message }
    } finally {
      if (!pdfWin.isDestroyed()) pdfWin.destroy()
    }
  })

  // ── 창 제어 ───────────────────────────────────────────────────
  ipcMain.on('win-minimize', () => mainWin?.minimize())
  ipcMain.on('win-maximize', () => mainWin?.isMaximized() ? mainWin.unmaximize() : mainWin.maximize())
  ipcMain.on('win-close',    () => mainWin?.close())

  // ── 앱 정보 ───────────────────────────────────────────────────
  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(), platform: process.platform,
    electron: process.versions.electron, userData: USER_DATA,
    isPackaged: app.isPackaged,
  }))
  ipcMain.handle('open-external', (_, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url) })
  ipcMain.handle('open-user-data', () => shell.openPath(USER_DATA))

  // ══════════════════════════════════════════════════════════════
  // LOGGER IPC
  // ══════════════════════════════════════════════════════════════

  // renderer → main 로그 기록
  ipcMain.on('log-write', (_, { level, msg }) => {
    writeLog(level || 'info', '[Renderer]', msg)
  })

  // 로그 파일 목록
  ipcMain.handle('log-list', () => {
    try {
      return fs.readdirSync(LOG_DIR)
        .filter(f => f.endsWith('.log'))
        .sort().reverse()
        .map(f => {
          const full = path.join(LOG_DIR, f)
          return { name: f, size: fs.statSync(full).size, filePath: full }
        })
    } catch { return [] }
  })

  // 로그 파일 내용 읽기 (최근 N줄)
  ipcMain.handle('log-read', (_, { fileName, lines = 200 }) => {
    try {
      const filePath = safeJoin(LOG_DIR, fileName)
      if (!filePath) return ''   // path traversal 차단
      const content = fs.readFileSync(filePath, 'utf-8')
      return content.split('\n').slice(-lines).join('\n')
    } catch { return '' }
  })

  // 로그 파일 내보내기 (저장 다이얼로그)
  ipcMain.handle('log-export', async (_, { fileName }) => {
    const src = safeJoin(LOG_DIR, fileName)
    if (!src || !fs.existsSync(src)) return { success: false, error: 'File not found' }
    const result = await dialog.showSaveDialog(mainWin, {
      defaultPath: fileName,
      filters: [{ name: '로그 파일', extensions: ['log'] }],
    })
    if (result.canceled) return { success: false }
    fs.copyFileSync(src, result.filePath)
    logger.info(`[Log] 내보내기: ${result.filePath}`)
    return { success: true, filePath: result.filePath }
  })

  // 로그 폴더 열기
  ipcMain.handle('log-open-dir', () => shell.openPath(LOG_DIR))

  // ══════════════════════════════════════════════════════════════
  // BACKUP IPC
  // ══════════════════════════════════════════════════════════════

  ipcMain.handle('backup-now',     ()          => runBackup('manual'))
  ipcMain.handle('backup-list',    ()          => listBackups())
  ipcMain.handle('backup-restore', (_, {filePath}) => {
    // path traversal 방지 (resolve 기반 엄격 검증)
    if (!isSafePath(BACKUP_DIR, filePath)) return { success: false, error: '잘못된 경로' }
    return restoreBackup(filePath)
  })
  ipcMain.handle('backup-delete', (_, { filePath }) => {
    try {
      if (!isSafePath(BACKUP_DIR, filePath)) return { success: false }
      fs.unlinkSync(filePath)
      logger.info('[Backup] 삭제:', path.basename(filePath))
      return { success: true }
    } catch (e) { return { success: false, error: e.message } }
  })
  ipcMain.handle('backup-open-dir', () => shell.openPath(BACKUP_DIR))

  // 백업 파일 내보내기 (.aebak → 사용자 선택 위치)
  ipcMain.handle('backup-export', async (_, { filePath }) => {
    if (!isSafePath(BACKUP_DIR, filePath)) return { success: false }
    const result = await dialog.showSaveDialog(mainWin, {
      defaultPath: path.basename(filePath),
      filters: [{ name: 'Aether 백업', extensions: ['aebak'] }],
    })
    if (result.canceled) return { success: false }
    fs.copyFileSync(filePath, result.filePath)
    return { success: true, filePath: result.filePath }
  })

  // 외부 .aebak 파일 가져와서 복원
  ipcMain.handle('backup-import', async () => {
    const result = await dialog.showOpenDialog(mainWin, {
      filters: [{ name: 'Aether 백업', extensions: ['aebak'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return { success: false }
    return restoreBackup(result.filePaths[0])
  })

  // ══════════════════════════════════════════════════════════════
  // DISCORD FEEDBACK IPC
  // ══════════════════════════════════════════════════════════════

  ipcMain.handle('send-feedback', async (_, { webhookUrl, payload }) => {
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return { success: false, error: '유효하지 않은 Webhook URL' }
    }
    try {
      const res = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) return { success: false, error: `Discord 오류: ${res.status}` }
      logger.info(`[Feedback] 전송 완료 (category: ${payload.category})`)
      return { success: true }
    } catch (e) {
      logger.error('[Feedback] 전송 실패:', e.message)
      return { success: false, error: e.message }
    }
  })

  // ══════════════════════════════════════════════════════════════
  // WHAT'S NEW IPC
  // ══════════════════════════════════════════════════════════════

  // 릴리즈 노트 읽기
  ipcMain.handle('whats-new-get', () => {
    return { notes: getReleaseNotes(), current: app.getVersion() }
  })

  // 현재 버전 확인 완료 기록 (다시 안 띄움)
  ipcMain.handle('whats-new-seen', () => {
    writeAppMeta({ lastSeenVersion: app.getVersion() })
    return true
  })

  // ══════════════════════════════════════════════════════════════
  // AUTO-UPDATER IPC
  // ══════════════════════════════════════════════════════════════

  ipcMain.handle('updater-check',    async () => {
    if (!autoUpdater) return { available: false, reason: 'dev-mode' }
    try { const r = await autoUpdater.checkForUpdates(); return { available: !!r?.updateInfo?.version } }
    catch (e) { return { available: false, reason: e.message } }
  })
  ipcMain.handle('updater-download', async () => {
    if (!autoUpdater) return { ok: false }
    try { await autoUpdater.downloadUpdate(); return { ok: true } }
    catch (e) { return { ok: false, error: e.message } }
  })
  ipcMain.on('updater-install', () => autoUpdater?.quitAndInstall(false, true))

  // ══════════════════════════════════════════════════════════════
  // AUTO-SETUP IPC (Ollama + ComfyUI)
  // ══════════════════════════════════════════════════════════════

  // ── Ollama ──
  ipcMain.handle('setup-ollama-check',   ()         => checkOllamaStatus())
  ipcMain.handle('setup-ollama-install', ()         => installOllama())
  ipcMain.handle('setup-ollama-start',   ()         => startOllama())
  ipcMain.handle('setup-ollama-pull',    (_, model) => pullOllamaModel(model))
  ipcMain.handle('setup-ollama-full',    ()         => fullOllamaSetup())

  // ── ComfyUI ──
  ipcMain.handle('setup-comfy-check',       ()               => checkComfyStatus())
  ipcMain.handle('setup-comfy-install',     ()               => installComfyPortable())
  ipcMain.handle('setup-comfy-start',       ()               => startComfyUI())
  ipcMain.handle('setup-comfy-model',       (_, { key, url }) => downloadComfyModel(key, url))
  ipcMain.handle('setup-comfy-full',        ()               => fullComfySetup())

  // ── ComfyUI 모델 URL 업데이트 (renderer에서 설정한 URL 반영) ──
  ipcMain.handle('setup-comfy-set-model-url', (_, { key, url }) => {
    if (COMFY_MODEL_DEFS[key]) { COMFY_MODEL_DEFS[key].url = url; return true }
    return false
  })
}

// ══════════════════════════════════════════════════════════════════
// AUTO-SETUP: 다운로드 유틸리티
// ══════════════════════════════════════════════════════════════════

/** renderer로 설치 진행률 전송 */
function sendSetupProgress(stage, percent, message, extra = {}) {
  mainWin?.webContents.send('setup-progress', { stage, percent, message, ...extra })
}

/**
 * 파일 다운로드 (리다이렉트 자동 처리, 진행률 콜백)
 * @returns {Promise<string>} 저장된 파일 경로
 */
function downloadFile(url, destPath, onProgress, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { headers: { 'User-Agent': 'Aether-AI/1.1.0' } }, (res) => {
      // 리다이렉트 처리
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error('리다이렉트 횟수 초과'))
        const redir = new URL(res.headers.location, url).href
        return downloadFile(redir, destPath, onProgress, maxRedirects - 1).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
      }
      const total = parseInt(res.headers['content-length'] || '0')
      let received = 0
      const writer = fs.createWriteStream(destPath)
      res.on('data', (chunk) => {
        received += chunk.length
        onProgress?.(received, total, total > 0 ? Math.round(received / total * 100) : -1)
      })
      res.pipe(writer)
      writer.on('finish', () => { writer.close(); resolve(destPath) })
      writer.on('error', (e) => { fs.unlink(destPath, () => {}); reject(e) })
    }).on('error', reject)
  })
}

/** 바이트 → 사람이 읽을 수 있는 문자열 */
function fmtBytes(b) {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB'
  return (b / 1073741824).toFixed(2) + ' GB'
}

// ══════════════════════════════════════════════════════════════════
// AUTO-SETUP: OLLAMA (로컬 LLM 엔진)
// ══════════════════════════════════════════════════════════════════

/**
 * Ollama 설치 여부 + 실행 상태 + 설치된 모델 목록 반환
 */
async function checkOllamaStatus() {
  const result = { installed: false, running: false, models: [], path: null }

  // 1) 실행 파일 존재 여부
  try {
    if (process.platform === 'win32') {
      const where = execSync('where ollama 2>nul', { encoding: 'utf-8', timeout: 5000 }).trim()
      if (where) { result.installed = true; result.path = where.split(/\r?\n/)[0] }
    } else {
      const which = execSync('which ollama 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim()
      if (which) { result.installed = true; result.path = which }
    }
  } catch {}

  // 2) API 응답 (running + model 목록)
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      result.running = true
      result.installed = true
      const data = await res.json()
      result.models = (data.models || []).map(m => m.name)
    }
  } catch {}

  return result
}

/**
 * Ollama 설치 (Windows: OllamaSetup.exe 다운로드 → 실행)
 * @param {boolean} skipConsent - true이면 동의 다이얼로그 건너뛰기
 */
async function installOllama(skipConsent = false) {
  // ── 동의 다이얼로그 ──
  if (!skipConsent) {
    const { response } = await dialog.showMessageBox(mainWin, {
      type: 'question',
      title: '🦙 Ollama 설치 안내',
      message: 'Ollama (로컬 AI 엔진)를 설치하시겠습니까?',
      detail: [
        'Ollama는 컴퓨터에서 직접 AI 모델을 실행하는 도구입니다.',
        '인터넷 없이도 AI 기능을 사용할 수 있습니다.',
        '',
        '📦 설치 내용:',
        '  • Ollama 엔진: ~100 MB 다운로드',
        '',
        '설치 후 아래 모델을 별도로 다운로드합니다:',
        '  • llama3.2 (AI 채팅·브레인스토밍): ~2 GB',
        '  • nomic-embed-text (백과사전 검색): ~274 MB',
        '',
        '⏱ 예상 시간: 인터넷 속도에 따라 5~20분',
        '📍 설치 위치: 시스템 기본 경로 (C:\\Users\\사용자\\AppData)',
        '',
        '※ 설치 중 Windows 보안(UAC) 알림이 표시될 수 있습니다.',
      ].join('\n'),
      buttons: ['설치 시작', '취소'],
      defaultId: 0, cancelId: 1, noLink: true,
    })
    if (response !== 0) return { success: false, reason: 'user-cancelled' }
  }

  const installerPath = path.join(SETUP_DIR, 'OllamaSetup.exe')
  try {
    // 1) 다운로드
    logger.info('[Setup/Ollama] 인스톨러 다운로드 시작')
    sendSetupProgress('ollama-download', 0, 'Ollama 설치 파일 다운로드 중...')

    await downloadFile(OLLAMA_INSTALLER_URL, installerPath, (rx, total, pct) => {
      sendSetupProgress('ollama-download', pct, `다운로드 중... ${fmtBytes(rx)} / ${fmtBytes(total)}`)
    })
    sendSetupProgress('ollama-download', 100, '다운로드 완료')
    logger.info('[Setup/Ollama] 다운로드 완료:', installerPath)

    // 2) 설치 실행 (사일런트)
    sendSetupProgress('ollama-install', -1, 'Ollama 설치 중... (보안 알림이 표시되면 허용해주세요)')
    await new Promise((resolve, reject) => {
      exec(`"${installerPath}" /S`, { timeout: 300000 }, (err) => {
        if (err) reject(err); else resolve()
      })
    })

    // 3) 설치 확인
    await new Promise(r => setTimeout(r, 2000))
    const status = await checkOllamaStatus()
    if (!status.installed) throw new Error('설치 후에도 ollama 명령이 감지되지 않습니다')

    sendSetupProgress('ollama-install', 100, 'Ollama 설치 완료!')
    logger.info('[Setup/Ollama] 설치 성공')

    // 정리
    try { fs.unlinkSync(installerPath) } catch {}

    return { success: true }
  } catch (e) {
    logger.error('[Setup/Ollama] 설치 실패:', e.message)
    sendSetupProgress('ollama-install', -1, `설치 실패: ${e.message}`)
    try { fs.unlinkSync(installerPath) } catch {}
    return { success: false, error: e.message }
  }
}

/**
 * Ollama 서비스 시작 (백그라운드)
 */
async function startOllama() {
  const status = await checkOllamaStatus()
  if (status.running) return { success: true, already: true }
  if (!status.installed) return { success: false, error: 'Ollama가 설치되어 있지 않습니다' }

  try {
    // OLLAMA_ORIGINS=* 로 CORS 허용하여 시작
    const env = { ...process.env, OLLAMA_ORIGINS: '*' }
    const child = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', env })
    child.unref()
    logger.info('[Setup/Ollama] serve 프로세스 시작 (PID:', child.pid, ')')

    // API 응답 대기 (최대 15초)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500))
      try {
        const res = await fetch('http://localhost:11434/', { signal: AbortSignal.timeout(2000) })
        if (res.ok) return { success: true }
      } catch {}
    }
    return { success: false, error: '서버 시작 대기 시간 초과' }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Ollama 모델 pull (진행률을 setup-progress 이벤트로 전송)
 */
function pullOllamaModel(modelName) {
  return new Promise((resolve, reject) => {
    sendSetupProgress('ollama-pull', 0, `${modelName} 다운로드 준비 중...`)
    logger.info(`[Setup/Ollama] 모델 pull 시작: ${modelName}`)

    const proc = spawn('ollama', ['pull', modelName], { env: { ...process.env, OLLAMA_ORIGINS: '*' } })
    let lastOutput = ''

    const onData = (data) => {
      const line = data.toString().trim()
      if (!line) return
      lastOutput = line
      // ollama pull 출력에서 퍼센트 파싱: "pulling abc123...  42% ▕████ ▏ 850 MB/2.0 GB"
      const match = line.match(/(\d+)%/)
      const pct = match ? parseInt(match[1]) : -1
      sendSetupProgress('ollama-pull', pct, `${modelName}: ${line}`, { model: modelName })
    }

    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)

    proc.on('close', (code) => {
      if (code === 0) {
        sendSetupProgress('ollama-pull', 100, `${modelName} 다운로드 완료!`, { model: modelName })
        logger.info(`[Setup/Ollama] 모델 pull 완료: ${modelName}`)
        resolve({ success: true, model: modelName })
      } else {
        const msg = `모델 다운로드 실패 (code ${code}): ${lastOutput}`
        logger.error(`[Setup/Ollama] ${msg}`)
        reject(new Error(msg))
      }
    })
    proc.on('error', (e) => reject(e))
  })
}

/**
 * Ollama 전체 자동 설치: 설치 → 시작 → 기본 모델 pull
 */
async function fullOllamaSetup() {
  try {
    let status = await checkOllamaStatus()

    // 1) 미설치면 설치
    if (!status.installed) {
      const installResult = await installOllama()
      if (!installResult.success) return installResult
      status = await checkOllamaStatus()
    }

    // 2) 미실행이면 시작
    if (!status.running) {
      const startResult = await startOllama()
      if (!startResult.success) return startResult
      await new Promise(r => setTimeout(r, 1000))
      status = await checkOllamaStatus()
    }

    // 3) 기본 모델 pull — 미설치 모델만 필터링 후 순차 다운로드
    //    (Ollama는 동시 pull을 지원하지 않으므로 순차 유지)
    const needPull = OLLAMA_DEFAULT_MODELS.filter(
      model => !status.models.some(m => m.startsWith(model))
    )
    const alreadyDone = OLLAMA_DEFAULT_MODELS.length - needPull.length
    if (alreadyDone > 0) {
      logger.info(`[Setup/Ollama] ${alreadyDone}개 모델 이미 설치됨 — 건너뜀`)
      sendSetupProgress('ollama-pull', Math.round((alreadyDone / OLLAMA_DEFAULT_MODELS.length) * 100),
        `${alreadyDone}개 모델 이미 설치됨`)
    }
    for (let i = 0; i < needPull.length; i++) {
      await pullOllamaModel(needPull[i])
    }

    sendSetupProgress('ollama-complete', 100, 'Ollama 설치 및 모델 다운로드 완료!')
    return { success: true }
  } catch (e) {
    logger.error('[Setup/Ollama] 전체 설치 실패:', e.message)
    return { success: false, error: e.message }
  }
}

// ══════════════════════════════════════════════════════════════════
// AUTO-SETUP: COMFYUI PORTABLE (이미지 생성 엔진)
// ══════════════════════════════════════════════════════════════════

/**
 * ComfyUI 설치 상태 확인
 */
async function checkComfyStatus() {
  const result = { installed: false, running: false, path: null, models: {} }

  // 1) 디렉토리 존재 확인
  const mainPy = path.join(COMFY_ROOT, 'ComfyUI', 'main.py')
  const altMainPy = path.join(COMFY_ROOT, 'main.py')
  if (fs.existsSync(mainPy)) {
    result.installed = true; result.path = path.join(COMFY_ROOT, 'ComfyUI')
  } else if (fs.existsSync(altMainPy)) {
    result.installed = true; result.path = COMFY_ROOT
  }

  // 2) 모델 파일 존재 확인
  if (result.path) {
    for (const [key, def] of Object.entries(COMFY_MODEL_DEFS)) {
      const modelPath = path.join(result.path, def.subdir, def.filename)
      result.models[key] = fs.existsSync(modelPath)
    }
  }

  // 3) 서버 실행 확인
  try {
    const res = await fetch('http://localhost:8188/system_stats', { signal: AbortSignal.timeout(3000) })
    if (res.ok) result.running = true
  } catch {}

  return result
}

/**
 * GitHub API에서 최신 ComfyUI 포터블 릴리즈 URL 가져오기
 */
async function getComfyDownloadUrl() {
  const res = await fetch(COMFY_RELEASES_API, {
    headers: { 'User-Agent': 'Aether-AI/1.1.0', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`GitHub API 오류: ${res.status}`)
  const release = await res.json()
  const asset = (release.assets || []).find(a => COMFY_ASSET_PATTERN.test(a.name))
  if (!asset) throw new Error('ComfyUI 포터블 릴리즈 에셋을 찾을 수 없습니다')
  return { url: asset.browser_download_url, name: asset.name, size: asset.size, version: release.tag_name }
}

/**
 * 7zr.exe 다운로드 (7z 압축 해제용 독립 실행 파일)
 */
async function ensure7zr() {
  if (fs.existsSync(SEVEN_ZIP_EXE)) return SEVEN_ZIP_EXE
  logger.info('[Setup/ComfyUI] 7zr.exe 다운로드 중...')
  sendSetupProgress('comfy-download', -1, '압축 해제 도구 준비 중...')
  await downloadFile(SEVEN_ZIP_URL, SEVEN_ZIP_EXE, null)
  return SEVEN_ZIP_EXE
}

/**
 * 7z 파일 압축 해제
 */
function extract7z(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    sendSetupProgress('comfy-extract', -1, '압축 해제 중... (시간이 걸릴 수 있습니다)')
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

    const proc = spawn(SEVEN_ZIP_EXE, ['x', archivePath, `-o${destDir}`, '-y'], { stdio: ['ignore', 'pipe', 'pipe'] })

    proc.stdout.on('data', (d) => {
      const line = d.toString().trim()
      const match = line.match(/(\d+)%/)
      if (match) sendSetupProgress('comfy-extract', parseInt(match[1]), `압축 해제 중... ${match[1]}%`)
    })

    proc.on('close', (code) => {
      if (code === 0) { logger.info('[Setup/ComfyUI] 압축 해제 완료'); resolve() }
      else reject(new Error(`7z 압축 해제 실패 (code ${code})`))
    })
    proc.on('error', reject)
  })
}

/**
 * ComfyUI 포터블 설치
 */
async function installComfyPortable(skipConsent = false) {
  if (!skipConsent) {
    const { response } = await dialog.showMessageBox(mainWin, {
      type: 'question',
      title: '🎨 ComfyUI 포터블 설치 안내',
      message: 'ComfyUI (이미지 생성 AI)를 설치하시겠습니까?',
      detail: [
        'ComfyUI는 AI 이미지를 생성하는 도구입니다.',
        '캐릭터 일러스트와 표지 이미지 제작에 사용됩니다.',
        '',
        '📦 설치 내용:',
        '  • ComfyUI Portable: ~2 GB (Python + 엔진 포함)',
        '  • ※ 모델 파일은 별도로 다운로드해야 합니다',
        '',
        '📍 설치 위치 (포터블):',
        `  ${COMFY_ROOT}`,
        '',
        '⏱ 예상 시간: 10~30분 (인터넷 속도에 따라 다름)',
        '💾 필요 공간: 최소 3 GB (모델 미포함)',
        '',
        '※ NVIDIA GPU가 있으면 GPU 가속을 사용합니다.',
        '※ GPU가 없으면 CPU 모드로 동작합니다 (느림).',
      ].join('\n'),
      buttons: ['설치 시작', '취소'],
      defaultId: 0, cancelId: 1, noLink: true,
    })
    if (response !== 0) return { success: false, reason: 'user-cancelled' }
  }

  try {
    // 1) 최신 릴리즈 정보 가져오기
    sendSetupProgress('comfy-download', 0, '최신 버전 확인 중...')
    const releaseInfo = await getComfyDownloadUrl()
    logger.info(`[Setup/ComfyUI] 릴리즈: ${releaseInfo.version}, 파일: ${releaseInfo.name}, 크기: ${fmtBytes(releaseInfo.size)}`)

    // 2) 7zr.exe 확보
    await ensure7zr()

    // 3) 포터블 다운로드
    const archivePath = path.join(SETUP_DIR, releaseInfo.name)
    if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size !== releaseInfo.size) {
      sendSetupProgress('comfy-download', 0, `ComfyUI ${releaseInfo.version} 다운로드 중...`)
      await downloadFile(releaseInfo.url, archivePath, (rx, total, pct) => {
        sendSetupProgress('comfy-download', pct, `다운로드 중... ${fmtBytes(rx)} / ${fmtBytes(total)}`)
      })
      logger.info('[Setup/ComfyUI] 다운로드 완료:', archivePath)
    } else {
      logger.info('[Setup/ComfyUI] 이미 다운로드된 파일 사용:', archivePath)
    }

    // 4) 압축 해제
    sendSetupProgress('comfy-extract', 0, '압축 해제 중...')
    await extract7z(archivePath, COMFY_ROOT)

    // 5) 설치 확인
    const status = await checkComfyStatus()
    if (!status.installed) throw new Error('압축 해제 후 ComfyUI main.py를 찾을 수 없습니다')

    sendSetupProgress('comfy-install', 100, 'ComfyUI 포터블 설치 완료!')
    logger.info('[Setup/ComfyUI] 설치 성공:', status.path)

    // 아카이브 정리
    try { fs.unlinkSync(archivePath) } catch {}

    return { success: true, path: status.path, version: releaseInfo.version }
  } catch (e) {
    logger.error('[Setup/ComfyUI] 설치 실패:', e.message)
    sendSetupProgress('comfy-install', -1, `설치 실패: ${e.message}`)
    return { success: false, error: e.message }
  }
}

/**
 * ComfyUI 모델 파일 다운로드
 * @param {string} modelKey - 'unet' | 'clip1' | 'clip2' | 'vae'
 * @param {string} url - 다운로드 URL (없으면 COMFY_MODEL_DEFS 기본값 사용)
 */
async function downloadComfyModel(modelKey, url) {
  const def = COMFY_MODEL_DEFS[modelKey]
  if (!def) return { success: false, error: `알 수 없는 모델 키: ${modelKey}` }

  const downloadUrl = url || def.url
  if (!downloadUrl) return { success: false, error: `${def.label}: 다운로드 URL이 설정되지 않았습니다. API 설정에서 URL을 입력하세요.` }

  const status = await checkComfyStatus()
  if (!status.installed) return { success: false, error: 'ComfyUI가 설치되어 있지 않습니다' }

  const destDir  = path.join(status.path, def.subdir)
  const destPath = path.join(destDir, def.filename)

  // 이미 존재하면 건너뛰기
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1024) {
    logger.info(`[Setup/ComfyUI] 모델 이미 존재: ${def.filename}`)
    return { success: true, already: true }
  }

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

  try {
    sendSetupProgress('comfy-model', 0, `${def.label} 다운로드 중...`, { model: modelKey })
    await downloadFile(downloadUrl, destPath, (rx, total, pct) => {
      sendSetupProgress('comfy-model', pct, `${def.label}: ${fmtBytes(rx)} / ${fmtBytes(total)}`, { model: modelKey })
    })
    sendSetupProgress('comfy-model', 100, `${def.label} 다운로드 완료!`, { model: modelKey })
    logger.info(`[Setup/ComfyUI] 모델 다운로드 완료: ${def.filename}`)
    return { success: true }
  } catch (e) {
    logger.error(`[Setup/ComfyUI] 모델 다운로드 실패 (${modelKey}):`, e.message)
    return { success: false, error: e.message }
  }
}

/**
 * ComfyUI 서버 시작 (포터블)
 */
async function startComfyUI() {
  const status = await checkComfyStatus()
  if (status.running) return { success: true, already: true }
  if (!status.installed) return { success: false, error: 'ComfyUI가 설치되어 있지 않습니다' }

  try {
    // 포터블 패키지의 실행 스크립트 찾기
    const runBat   = path.join(COMFY_ROOT, 'run_nvidia_gpu.bat')
    const runCpu   = path.join(COMFY_ROOT, 'run_cpu.bat')
    const pythonExe = path.join(COMFY_ROOT, 'python_embeded', 'python.exe')
    const mainPy    = path.join(status.path, 'main.py')

    let child
    if (fs.existsSync(pythonExe) && fs.existsSync(mainPy)) {
      // 직접 Python으로 실행 (--enable-cors-header 추가)
      child = spawn(pythonExe, [mainPy, '--enable-cors-header', '--listen', '127.0.0.1', '--port', '8188'], {
        cwd: status.path, detached: true, stdio: 'ignore',
        env: { ...process.env },
      })
    } else if (fs.existsSync(runBat)) {
      child = spawn('cmd', ['/c', runBat], { cwd: COMFY_ROOT, detached: true, stdio: 'ignore' })
    } else if (fs.existsSync(runCpu)) {
      child = spawn('cmd', ['/c', runCpu], { cwd: COMFY_ROOT, detached: true, stdio: 'ignore' })
    } else {
      return { success: false, error: '실행 스크립트를 찾을 수 없습니다' }
    }

    child.unref()
    logger.info('[Setup/ComfyUI] 서버 시작 (PID:', child.pid, ')')

    // API 응답 대기 (최대 60초 — 첫 시작은 느릴 수 있음)
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 500))
      try {
        const res = await fetch('http://localhost:8188/system_stats', { signal: AbortSignal.timeout(2000) })
        if (res.ok) return { success: true, pid: child.pid }
      } catch {}
    }
    return { success: false, error: '서버 시작 대기 시간 초과 (60초)' }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * ComfyUI 전체 자동 설치: 포터블 설치 → 서버 시작
 * (모델 다운로드는 URL 필요 → 별도 호출)
 */
async function fullComfySetup() {
  try {
    let status = await checkComfyStatus()

    if (!status.installed) {
      const r = await installComfyPortable()
      if (!r.success) return r
      status = await checkComfyStatus()
    }

    if (!status.running) {
      const r = await startComfyUI()
      if (!r.success) return r
    }

    sendSetupProgress('comfy-complete', 100, 'ComfyUI 설치 및 실행 완료!')
    return { success: true, path: status.path, models: status.models }
  } catch (e) {
    logger.error('[Setup/ComfyUI] 전체 설치 실패:', e.message)
    return { success: false, error: e.message }
  }
}

// ══════════════════════════════════════════════════════════════════
// 앱 메뉴
// ══════════════════════════════════════════════════════════════════
function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '파일', submenu: [
        { label: '새 작품 만들기', accelerator: 'CmdOrCtrl+N', click: () => mainWin?.webContents.send('menu-action', 'new-project') },
        { type: 'separator' },
        { label: '내보내기', accelerator: 'CmdOrCtrl+E', click: () => mainWin?.webContents.send('menu-action', 'export') },
        { type: 'separator' },
        { label: '지금 백업', click: async () => {
          const r = await runBackup('menu')
          mainWin?.webContents.send('backup-done', r)
        }},
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: '종료' },
      ],
    },
    {
      label: '편집', submenu: [
        { role: 'undo', label: '실행 취소' }, { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' }, { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' }, { role: 'selectAll', label: '전체 선택' },
        { type: 'separator' },
        { label: '찾기/바꾸기', accelerator: 'CmdOrCtrl+H', click: () => mainWin?.webContents.send('menu-action', 'find-replace') },
      ],
    },
    {
      label: '보기', submenu: [
        { role: 'reload', label: '새로고침' }, { role: 'toggleDevTools', label: '개발자 도구' },
        { type: 'separator' },
        { role: 'resetZoom', label: '기본 크기' }, { role: 'zoomIn', label: '크게' }, { role: 'zoomOut', label: '작게' },
        { type: 'separator' }, { role: 'togglefullscreen', label: '전체 화면' },
      ],
    },
    {
      label: '도움말', submenu: [
        { label: `Aether AI v${app.getVersion()}`, enabled: false },
        { label: `Electron v${process.versions.electron}`, enabled: false },
        { type: 'separator' },
        { label: '새 기능 보기',      click: () => mainWin?.webContents.send('menu-action', 'whats-new') },
        { label: '피드백 보내기',     click: () => mainWin?.webContents.send('menu-action', 'feedback') },
        { label: '로그 보기',         click: () => mainWin?.webContents.send('menu-action', 'log-viewer') },
        { label: '업데이트 확인',     click: () => { if (autoUpdater) autoUpdater.checkForUpdates().catch(()=>{}) } },
        { type: 'separator' },
        { label: 'userData 폴더 열기', click: () => shell.openPath(USER_DATA) },
        { label: '백업 폴더 열기',    click: () => shell.openPath(BACKUP_DIR) },
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}
