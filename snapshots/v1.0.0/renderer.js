/**
 * Aether AI — renderer.js
 *
 * Electron Fiddle 호환용 렌더러 엔트리 파일입니다.
 *
 * Aether의 모든 렌더러 JavaScript는 index.html의 인라인 <script> 블록에
 * 포함되어 있으므로, 이 파일은 추가 초기화가 필요한 경우에만 사용합니다.
 *
 * index.html이 로드되면 인라인 스크립트의 initApp()이 자동 호출되어
 * window.aether (preload.js의 contextBridge API)를 통해 Electron과 통신합니다.
 *
 * ── 아키텍처 ──
 *
 *   [main.js]  ←──IPC──→  [preload.js]  ←──contextBridge──→  [index.html + 인라인 JS]
 *   메인 프로세스            브릿지                              렌더러 프로세스
 *                                                              (이 파일은 보조 역할)
 *
 * ── window.aether API ──
 *
 *   데이터:     saveProjects, loadProjects, saveSettings, loadSettings,
 *              saveEncy, loadEncy, saveEncyEmbed, loadEncyEmbed,
 *              saveWorldDict, loadWorldDict, saveRevisions, loadRevisions,
 *              saveSummaries, loadSummaries, saveHistory, loadHistory
 *   파일:      saveFile, printToPDF
 *   창 제어:    minimize, maximize, close
 *   앱 정보:    getAppInfo, openExternal, openUserData
 *   로그:      log.{write, debug, info, warn, error, list, read, export, openDir}
 *   백업:      backup.{now, list, restore, delete, export, import, openDir, onDone}
 *   피드백:     feedback.send
 *   업데이트:   whatsNew.{get, seen}, updater.{check, download, install, onStatus}
 *   이벤트:     on(channel, handler), off(channel)
 */

// index.html 인라인 스크립트가 모든 초기화를 처리합니다.
// 필요 시 여기에 추가 렌더러 로직을 작성할 수 있습니다.
console.log('[Aether] renderer.js loaded')
