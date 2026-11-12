// Motor de audio: <audio> para Audius / Internet Archive y el reproductor
// oficial de YouTube (IFrame API) para vídeos. Una sola interfaz para ambos.
import { streamUrl } from './sources/audius'
import { archive } from './sources/archive'

const audio = new Audio()
audio.preload = 'auto'
let mode = 'audio' // 'audio' | 'yt'
let yt = null, ytReady = null
let cb = {}
let volume = 1

audio.addEventListener('ended', () => mode === 'audio' && cb.onEnded?.())
audio.addEventListener('play', () => mode === 'audio' && cb.onPlay?.())
audio.addEventListener('pause', () => mode === 'audio' && !audio.ended && cb.onPause?.())
audio.addEventListener('error', () => mode === 'audio' && audio.getAttribute('src') && cb.onError?.())
audio.addEventListener('waiting', () => mode === 'audio' && cb.onBuffer?.(true))
audio.addEventListener('playing', () => mode === 'audio' && cb.onBuffer?.(false))

function loadYT() {
  if (ytReady) return ytReady
  ytReady = new Promise((resolve, reject) => {
    const host = document.getElementById('yt-host')
    const el = document.createElement('div')
    host.appendChild(el)
    window.onYouTubeIframeAPIReady = () => {
      yt = new window.YT.Player(el, {
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, controls: 0, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => { yt.setVolume(volume * 100); resolve(yt) },
          onStateChange: (e) => {
            if (mode !== 'yt') return
            if (e.data === 0) cb.onEnded?.()
            else if (e.data === 1) { cb.onPlay?.(); cb.onBuffer?.(false) }
            else if (e.data === 2) cb.onPause?.()
            else if (e.data === 3) cb.onBuffer?.(true)
          },
          onError: () => mode === 'yt' && cb.onError?.(),
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
  else if (yt?.getCurrentTime) cb.onTime?.(yt.getCurrentTime() || 0, yt.getDuration() || 0)
}, 400)

export const engine = {
  on(handlers) { cb = handlers },
  mode: () => mode,
  async load(track, autoplay = true) {
    if (track.source === 'youtube') {
      audio.pause(); audio.removeAttribute('src')
      mode = 'yt'
      document.body.classList.add('yt-on')
      const p = await loadYT()
      if (autoplay) p.loadVideoById(track.sid); else p.cueVideoById(track.sid)
      return
    }
    if (mode === 'yt') { yt?.stopVideo?.(); document.body.classList.remove('yt-on') }
    mode = 'audio'
    audio.src = track.source === 'archive' ? await archive.resolve(track.sid) : streamUrl(track.sid)
    if (autoplay) audio.play().catch(() => { /* error real → evento 'error'; bloqueo de autoplay → queda en pausa */ })
  },
  play() { if (mode === 'yt') yt?.playVideo?.(); else audio.play().catch(() => {}) },
  pause() { if (mode === 'yt') yt?.pauseVideo?.(); else audio.pause() },
  seek(s) { if (mode === 'yt') yt?.seekTo?.(s, true); else if (isFinite(s)) audio.currentTime = s },
  setVolume(v) { volume = v; audio.volume = v; yt?.setVolume?.(v * 100) },
  stop() { audio.pause(); audio.removeAttribute('src'); yt?.stopVideo?.(); document.body.classList.remove('yt-on') },
}
