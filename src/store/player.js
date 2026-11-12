// Estado del reproductor: cola, pista actual, play/pausa, aleatorio, repetir, volumen.
import { create } from 'zustand'
import { engine } from '../lib/engine'
import { matchTrack, rejectMatch } from '../lib/matcher'
import { archive } from '../lib/sources/archive'
import { store } from '../lib/util'
import { toast } from './ui'
import { useLib } from './library'

let seq = 0      // identifica la carga en curso (descarta respuestas viejas)
let errors = 0   // fallos seguidos, para no saltar pistas sin fin
let retries = 0  // reintentos con otra coincidencia para la pista actual

export const usePlayer = create((set, get) => {
  const fail = (my, quiet) => {
    if (my !== seq) return
    const t = get().current
    const bad = get().resolved
    // Canción emparejada cuya fuente falla (vídeo no incrustable, enlace caído): se prueba la siguiente mejor
    if (t?.source === 'pending' && bad && retries < 3) { retries++; rejectMatch(t.q, bad); load(true, true); return }
    errors++
    // Las canciones sin coincidencia fiable se saltan sin avisar (ya salen en gris)
    if (!quiet) toast(t ? `No se pudo reproducir «${t.title}»` : 'No se pudo reproducir')
    if (errors < (quiet ? 60 : 5) && get().queue.length > 1) get().next(true, true)
    else { errors = 0; set({ isPlaying: false, loading: false }) }
  }

  const load = async (autoplay = true, retry = false) => {
    if (!retry) retries = 0
    const { queue, index } = get()
    const t = queue[index]
    if (!t) return
    const my = ++seq
    lastPos = -10
    set({ current: t, resolved: null, time: 0, duration: t.duration || 0, loading: true, isPlaying: autoplay })
    setMediaSession(t)
    try {
      let real = t
      if (t.source === 'pending') {
        real = await matchTrack(t.q)
        if (my !== seq) return
        if (!real) { fail(my, get().queue.length > 1); return }
        // La vía pública de Spotify no trae portada: se usa la de la fuente
        if (!t.cover && real.cover) set({ current: { ...t, cover: real.cover } })
      }
      set({ resolved: real })
      await engine.load(real, autoplay)
      if (my !== seq) return
    } catch { fail(my) }
  }

  // Deja lista la siguiente pista (coincidencia y URL) para que el cambio de canción
  // funcione también con la pantalla del móvil apagada
  const prefetch = () => {
    const s = get()
    const n = s.queue[s.index + 1]
    if (!n || s.shuffle) return
    Promise.resolve(n.source === 'pending' ? matchTrack(n.q) : n)
      .then((r) => r?.source === 'archive' && archive.resolve(r.sid)).catch(() => {})
  }

  let lastPos = 0
  const setPosition = (time, duration) => {
    if (!navigator.mediaSession?.setPositionState || !duration || !isFinite(duration) || Math.abs(time - lastPos) < 5) return
    lastPos = time
    try { navigator.mediaSession.setPositionState({ duration, position: Math.min(time, duration), playbackRate: 1 }) } catch { /* no soportado */ }
  }

  engine.on({
    onPlay: () => { errors = 0; set({ isPlaying: true, loading: false }); prefetch() },
    onPause: () => set({ isPlaying: false }),
    onBuffer: (b) => set({ loading: b }),
    onTime: (time, duration) => { setPosition(time, duration); set((s) => ({ time, duration: duration && isFinite(duration) ? duration : s.duration })) },
    onEnded: () => get().next(true),
    onError: () => fail(seq),
  })

  const setMediaSession = (t) => {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: t.album || 'Esputi',
        artwork: t.cover ? [{ src: t.cover, sizes: '480x480' }] : [],
      })
      navigator.mediaSession.setActionHandler('play', () => engine.play())
      navigator.mediaSession.setActionHandler('pause', () => engine.pause())
      navigator.mediaSession.setActionHandler('nexttrack', () => get().next())
      navigator.mediaSession.setActionHandler('previoustrack', () => get().prev())
      navigator.mediaSession.setActionHandler('seekto', (e) => e.seekTime != null && get().seek(e.seekTime))
    } catch { /* no soportado */ }
  }

  const volume = store.get('esputi.volume', 0.8)
  engine.setVolume(volume)

  return {
    queue: [], index: -1, current: null, resolved: null,
    isPlaying: false, loading: false, time: 0, duration: 0,
    volume, muted: false, shuffle: false, repeat: 'off', context: null, history: [],

    playList(tracks, start = 0, context = null) {
      if (!tracks?.length) return
      errors = 0
      set({ queue: tracks.slice(), index: Math.max(0, start), context, history: [] })
      if (context) useLib.getState().pushRecent(context)
      load(true)
    },
    toggle() {
      const s = get()
      if (!s.current) return
      if (s.isPlaying) engine.pause(); else engine.play()
    },
    next(auto = false, afterError = false) {
      const s = get()
      if (!s.queue.length) return
      if (auto && !afterError && s.repeat === 'one') { engine.seek(0); engine.play(); return }
      let i
      if (s.shuffle && s.queue.length > 1) { do { i = Math.floor(Math.random() * s.queue.length) } while (i === s.index) }
      else i = s.index + 1
      if (i >= s.queue.length) {
        if (s.repeat === 'all' || !auto) i = 0
        else { engine.pause(); engine.seek(0); set({ isPlaying: false, time: 0 }); return }
      }
      set({ index: i, history: [...s.history, s.index].slice(-50) })
      load(true)
    },
    prev() {
      const s = get()
      if (!s.queue.length) return
      if (s.time > 3) { engine.seek(0); set({ time: 0 }); return }
      const history = s.history.slice()
      const i = history.length ? history.pop() : Math.max(0, s.index - 1)
      set({ index: Math.min(i, s.queue.length - 1), history })
      load(true)
    },
    jump(i) {
      const s = get()
      if (i < 0 || i >= s.queue.length) return
      set({ index: i, history: [...s.history, s.index].slice(-50) })
      load(true)
    },
    seek(t) { engine.seek(t); set({ time: t }) },
    setVolume(v) { engine.setVolume(v); set({ volume: v, muted: false }); store.set('esputi.volume', v) },
    toggleMute() { const s = get(); engine.setVolume(s.muted ? s.volume : 0); set({ muted: !s.muted }) },
    toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
    cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
    addToQueue(t) {
      const empty = !get().queue.length
      set((s) => ({ queue: [...s.queue, t] }))
      if (empty) { set({ index: 0 }); load(true) } else toast('Añadida a la cola')
    },
    playNext(t) {
      const s = get()
      if (!s.queue.length) return get().addToQueue(t)
      const q = s.queue.slice(); q.splice(s.index + 1, 0, t)
      set({ queue: q }); toast('Sonará a continuación')
    },
    removeAt(i) {
      const s = get()
      if (i === s.index) return
      set({ queue: s.queue.filter((_, k) => k !== i), index: i < s.index ? s.index - 1 : s.index, history: [] })
    },
    stop() { seq++; engine.stop(); set({ queue: [], index: -1, current: null, resolved: null, isPlaying: false, time: 0, duration: 0 }) },
  }
})
