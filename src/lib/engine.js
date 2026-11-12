// Motor de audio: <audio> para Audius / Internet Archive y el reproductor oficial
// de YouTube (IFrame API, sin imagen a la vista) para el resto. Una sola interfaz.
//
// Pantalla apagada. El audio directo sigue sonando solo. El reproductor incrustado
// es vídeo y el móvil lo pausa al apagar la pantalla, así que se trabaja en capas:
//  1. Un sonido de fondo casi inaudible mantiene viva la página y hace que los
//     mandos de la pantalla de bloqueo sean los de Esputi.
//  2. Si el sistema pausa el vídeo con la pantalla apagada, se intenta reanudar
//     y, si no basta, se vuelve a cargar por donde iba.
//  3. Mientras no se haya comprobado en este móvil que lo anterior funciona, se
//     impide que la pantalla se bloquee sola (y la app la pone en negro).
import { streamUrl } from './sources/audius'
import { archive } from './sources/archive'
import { getSettings } from './settings'
import { store } from './util'

const audio = new Audio()
audio.preload = 'auto'
let mode = 'audio' // 'audio' | 'yt'
let yt = null, ytReady = null
let cb = {}
let volume = 1
let intent = false        // el usuario quiere que suene (aunque el sistema lo haya pausado)
let interrupted = false   // se cortó con la pantalla apagada: se retoma al volver
let ytState = -1, ytTime = 0, ytId = null
let switching = false     // cambiando de vídeo: la pausa del anterior no cuenta

const UA = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const IOS = /iPad|iPhone|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1)
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches

audio.addEventListener('ended', () => mode === 'audio' && cb.onEnded?.())
audio.addEventListener('play', () => mode === 'audio' && cb.onPlay?.())
audio.addEventListener('pause', () => mode === 'audio' && !audio.ended && cb.onPause?.())
audio.addEventListener('error', () => mode === 'audio' && audio.getAttribute('src') && cb.onError?.())
audio.addEventListener('waiting', () => mode === 'audio' && cb.onBuffer?.(true))
audio.addEventListener('playing', () => mode === 'audio' && cb.onBuffer?.(false))

// Diagnóstico anónimo del modo "pantalla apagada": solo un código de evento, visible en
// el registro del servidor, para saber qué hace cada navegador. No lleva datos del usuario.
const sent = new Set()
function beacon(code, once) {
  if (!import.meta.env.PROD) return
  if (once) { if (sent.has(once)) return; sent.add(once) }
  try { fetch(`${import.meta.env.BASE_URL}version.json?bg=${code}&t=${Date.now() % 100000}`, { cache: 'no-store', keepalive: true }).catch(() => {}) } catch { /* nada */ }
}

// ¿Se ha comprobado en este dispositivo que el reproductor incrustado sigue con la pantalla apagada?
let bg = store.get('esputi.bg', null) // 'ok' | 'no' | null
const setBg = (v) => { if (bg !== v) { bg = v; store.set('esputi.bg', v) } }

// ── 1. Sonido de fondo casi inaudible (40 Hz a −75 dB) ──
function quietWav(seconds = 12, rate = 8000) {
  const n = seconds * rate, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(6 * Math.sin((2 * Math.PI * 40 * i) / rate)), true)
  return new Blob([buf], { type: 'audio/wav' })
}
let keep = null, keepSelf = 0, manual = false
function keepEl() {
  if (keep) return keep
  keep = new Audio(URL.createObjectURL(quietWav()))
  keep.loop = true
  // Si se pausa o se reanuda sin que lo hayamos pedido, ha sido desde la pantalla de
  // bloqueo, los auriculares o una llamada: se sigue esa orden
  keep.addEventListener('pause', () => {
    if (Date.now() - keepSelf < 900 || mode !== 'yt' || !intent) return
    intent = false; clearTimeout(rescueTimer); yt?.pauseVideo?.(); cb.onPause?.(); wake()
  })
  keep.addEventListener('play', () => {
    if (Date.now() - keepSelf < 900 || mode !== 'yt') return
    manual = true; intent = true; interrupted = false; rescues = 0
    yt?.playVideo?.(); wake(); beacon('lk')
    if (document.hidden) rescue(1) // si aun así no arranca, se deja en pausa de verdad
  })
  return keep
}
const keepPlay = () => { if (IOS) return; keepSelf = Date.now(); keepEl().play().catch(() => {}) }
const keepPause = () => { if (!keep) return; keepSelf = Date.now(); keep.pause() }

// ── 3. Mantener la pantalla sin bloquear mientras haga falta ──
let lock = null
const needsScreen = () => TOUCH && mode === 'yt' && intent && bg !== 'ok' && getSettings().keepScreen !== false
async function wake() {
  try {
    if (needsScreen()) {
      if (!lock && navigator.wakeLock && !document.hidden) {
        lock = await navigator.wakeLock.request('screen')
        lock.addEventListener('release', () => { lock = null })
      }
    } else if (lock) { const l = lock; lock = null; await l.release() }
  } catch { /* sin permiso o sin soporte */ }
}

// ── 2. Rescate cuando el sistema pausa el vídeo con la pantalla apagada ──
let rescueTimer = null, rescues = 0, hiddenBase = null, hiddenStates = 0
function rescue(step) {
  clearTimeout(rescueTimer)
  rescueTimer = setTimeout(() => {
    if (mode !== 'yt' || !intent || !yt) return
    if (!document.hidden) { if (ytState !== 1) yt.playVideo(); return }
    if (ytState === 1) return // ya suena
    if (rescues++ > 4 || step > 1) {
      // No hay manera en este móvil: se deja en pausa (el botón de la pantalla de bloqueo
      // lo reanuda) y en adelante se evita que la pantalla se apague sola
      beacon('ko'); setBg('no'); interrupted = true; intent = false; keepPause(); cb.onPause?.()
      return
    }
    if (step === 0) { beacon('r1'); yt.playVideo() }
    else { beacon('r' + (step + 1)); yt.loadVideoById({ videoId: ytId, startSeconds: Math.max(0, ytTime - 1) }) }
    rescue(step + 1)
  }, step === 0 ? 700 : 3500)
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenBase = ytTime; manual = false
    if (mode === 'yt' && intent) beacon('h')
    return
  }
  hiddenBase = null; rescues = 0; hiddenStates = 0; sent.clear()
  if (mode === 'yt' && interrupted) { interrupted = false; engine.play() }
  else if (mode === 'yt' && intent && ytState !== 1 && ytState !== 3) yt?.playVideo?.()
  wake()
})

function loadYT() {
  if (ytReady) return ytReady
  ytReady = new Promise((resolve, reject) => {
    const host = document.getElementById('yt-host')
    const el = document.createElement('div')
    host.appendChild(el)
    window.onYouTubeIframeAPIReady = () => {
      yt = new window.YT.Player(el, {
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, controls: 0, rel: 0, modestbranding: 1, disablekb: 1, fs: 0, iv_load_policy: 3 },
        events: {
          onReady: () => { yt.setVolume(volume * 100); resolve(yt) },
          onStateChange: (e) => {
            ytState = e.data
            if (mode !== 'yt') return
            if (document.hidden && hiddenStates++ < 12) beacon('s' + e.data)
            if (e.data === 2 && switching) return
            if (e.data !== 2 && e.data !== 5) switching = false
            if (e.data === 0) cb.onEnded?.()
            else if (e.data === 1) {
              if (!intent) { intent = true; keepPlay(); wake() }
              cb.onPlay?.(); cb.onBuffer?.(false)
              if (document.hidden) beacon('pl', 'pl' + ytId)
            } else if (e.data === 2) {
              // Pausa con la pantalla apagada que nadie ha pedido: la ha hecho el sistema
              if (intent && document.hidden) { beacon('sp', 'sp' + ytId); rescue(0) }
              else { if (intent) { intent = false; keepPause(); wake() } cb.onPause?.() }
            } else if (e.data === 3) cb.onBuffer?.(true)
          },
          onError: (e) => { if (mode === 'yt') cb.onError?.(e.data) },
        },
      })
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.onerror = () => { ytReady = null; reject(new Error('YouTube no disponible')) }
    document.head.appendChild(s)
  })
  return ytReady
}

setInterval(() => {
  if (mode === 'audio') { if (audio.getAttribute('src')) cb.onTime?.(audio.currentTime || 0, audio.duration || 0) }
  else if (yt?.getCurrentTime) {
    ytTime = yt.getCurrentTime() || 0
    cb.onTime?.(ytTime, yt.getDuration() || 0)
    // Suena de verdad con la pantalla apagada y sin ayuda del usuario: este móvil lo permite
    if (document.hidden && hiddenBase != null && ytState === 1 && !manual && ytTime > hiddenBase + 6) {
      hiddenBase = null; setBg('ok'); beacon('ok', 'ok' + ytId); wake()
    }
  }
}, 400)

export const engine = {
  on(handlers) { cb = handlers },
  mode: () => mode,
  // ¿Hace falta ahora mismo tener la pantalla encendida para que no se corte la música?
  needsScreen,
  async load(track, autoplay = true) {
    clearTimeout(rescueTimer)
    interrupted = false
    if (track.source === 'youtube') {
      audio.pause(); audio.removeAttribute('src')
      mode = 'yt'
      intent = autoplay
      ytId = track.sid; ytTime = 0
      if (document.hidden) hiddenBase = 0
      if (autoplay) keepPlay()
      wake()
      const p = await loadYT()
      if (ytId !== track.sid) return // ya se pidió otra pista
      switching = true
      if (autoplay) p.loadVideoById(track.sid); else p.cueVideoById(track.sid)
      return
    }
    if (mode === 'yt') { yt?.stopVideo?.(); keepPause() }
    mode = 'audio'
    intent = autoplay
    wake()
    audio.src = track.source === 'archive' ? await archive.resolve(track.sid) : streamUrl(track.sid)
    if (autoplay) audio.play().catch(() => { /* error real → evento 'error'; bloqueo de autoplay → queda en pausa */ })
  },
  play() {
    intent = true; interrupted = false; rescues = 0
    if (mode === 'yt') { keepPlay(); yt?.playVideo?.(); wake() } else audio.play().catch(() => {})
  },
  pause() {
    intent = false; interrupted = false; clearTimeout(rescueTimer)
    if (mode === 'yt') { keepPause(); yt?.pauseVideo?.(); wake() } else audio.pause()
  },
  seek(s) { if (mode === 'yt') { yt?.seekTo?.(s, true); ytTime = s; if (hiddenBase != null) hiddenBase = s } else if (isFinite(s)) audio.currentTime = s },
  setVolume(v) { volume = v; audio.volume = v; yt?.setVolume?.(v * 100) },
  stop() {
    intent = false; interrupted = false; clearTimeout(rescueTimer)
    audio.pause(); audio.removeAttribute('src'); yt?.stopVideo?.(); keepPause(); wake()
  },
}
