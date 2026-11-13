// Estado del reproductor: cola, pista actual, play/pausa, aleatorio, repetir, volumen.
import { create } from 'zustand'
import { engine } from '../lib/engine'
import { matchTrack, rejectMatch } from '../lib/matcher'
import { buffer } from '../lib/buffer'
import { audius } from '../lib/sources/audius'
import { catalog } from '../lib/catalog'
import { getSettings } from '../lib/settings'
import { norm, store } from '../lib/util'
import { toast } from './ui'
import { useLib } from './library'

let seq = 0      // identifica la carga en curso (descarta respuestas viejas)
let errors = 0   // fallos seguidos, para no saltar pistas sin fin
let retries = 0  // reintentos con otra coincidencia para la pista actual
let gen = 0      // cambia cada vez que el usuario pone una lista nueva
let loadedAt = 0 // cuándo empezó a cargarse la pista actual

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
    loadedAt = Date.now()
    lastPos = -10
    set({ current: t, resolved: null, time: 0, duration: t.duration || 0, loading: true, isPlaying: autoplay })
    setMediaSession(t)
    refill()
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

  // Deja listas las dos pistas siguientes (coincidencia y URL) para que el cambio de canción
  // sea inmediato y funcione también con la pantalla del móvil apagada
  let pairs = [] // [pista de la cola, su fuente real] de la que suena y las dos siguientes
  let plan = []  // en aleatorio, las posiciones de la cola que sonarán después (ya sorteadas)
  const prefetch = async () => {
    const s = get(), my = seq
    const cur = s.queue[s.index]
    if (!cur) return
    if (s.shuffle) {
      // Se sortean ya las dos siguientes para poder tenerlas descargadas
      const out = new Set([...s.history, s.index, ...plan])
      while (plan.length < 2) {
        const rest = s.queue.map((_, k) => k).filter((k) => !out.has(k))
        if (!rest.length) break
        const k = rest[Math.floor(Math.random() * rest.length)]
        plan.push(k); out.add(k)
      }
    } else plan = []
    const upcoming = s.shuffle ? plan.map((k) => s.queue[k]) : s.queue.slice(s.index + 1, s.index + 3)
    const real = await Promise.all(upcoming.map((n) => Promise.resolve(n.source === 'pending' ? matchTrack(n.q) : n).catch(() => null)))
    if (my !== seq) return
    // Buffer local: las que se pueden descargar (fuentes abiertas) se bajan ya al móvil, primero
    // la que suena; lo que queda fuera de esta ventana (escuchado o saltado) se borra
    const curReal = get().resolved || pairs.find(([q]) => q.id === cur.id)?.[1]
    pairs = [[cur, curReal], ...upcoming.map((n, i) => [n, real[i]])].filter(([q, r]) => q && r)
    buffer.want(pairs.map(([, r]) => r))
  }
  buffer.on(() => {
    const local = pairs.filter(([, r]) => buffer.has(r.id)).map(([q]) => q.id)
    if (local.join() !== get().local.join()) set({ local, localBytes: buffer.stats().bytes })
  })
  // La cola ha cambiado: lo sorteado ya no vale y hay que revisar qué se tiene descargado
  const replan = () => { plan = []; if (get().current) prefetch() }

  // Música infinita: cuando quedan menos de tres canciones por delante se añaden más sin repetir.
  // Primero las del mismo artista; cuando se acaban, la radio de ese artista y luego sus parecidos.
  const first = (t) => String(t.artist || '').split(/,| & | feat/i)[0].trim()
  const key = (t) => norm(first(t)) + '|' + norm(String(t.title).replace(/\s*[([].*$/, ''))
  let filling = null
  const refill = () => {
    if (filling) return filling
    const s = get()
    if (getSettings().autoplay === false || s.repeat !== 'off' || !s.queue.length) return Promise.resolve(false)
    if (s.queue.length - 1 - s.index >= 3) return Promise.resolve(false)
    // La referencia es la última canción que eligió el usuario, no las añadidas solas
    const seed = s.queue[Math.min(s.queue.length, s.autoFrom ?? s.queue.length) - 1]
    const my = gen
    filling = (async () => {
      const have = new Set(get().queue.map(key))
      const fresh = (list) => list.filter((t) => { const k = key(t); if (have.has(k)) return false; have.add(k); return true })
      const add = (extra) => {
        if (!extra.length || my !== gen) return false
        set((now) => ({ queue: [...now.queue, ...extra], autoFrom: now.autoFrom ?? now.queue.length }))
        prefetch()
        return true
      }
      let id = String(seed.artistId || '').startsWith('cat:') ? seed.artistId.slice(4) : null
      if (!id) id = (await catalog.artistByName(first(seed)).catch(() => null))?.id.slice(4)
      if (!id) {
        // Música independiente (Audius): más de ese artista y luego lo más escuchado de su estilo
        if (seed.source !== 'audius') return false
        let more = seed.artistId ? fresh(await audius.userTracks(seed.artistId, 30).catch(() => [])).slice(0, 8) : []
        if (more.length < 5) more = [...more, ...fresh(await audius.trending(seed.genre || undefined, 40).catch(() => [])).slice(0, 10 - more.length)]
        return add(more)
      }
      let extra = fresh(await catalog.artistTop(id, 40)).slice(0, 8)
      if (extra.length < 5) extra = [...extra, ...fresh(await catalog.radio(id).catch(() => [])).slice(0, 10 - extra.length)]
      if (extra.length < 5) {
        // Ya no queda nada nuevo: canciones conocidas de artistas parecidos, mezcladas
        const rel = (await catalog.related(id).catch(() => [])).slice(0, 6)
        const tops = await Promise.all(rel.map((a) => catalog.artistTop(a.id.slice(4), 10).catch(() => [])))
        const mix = []
        for (let i = 0; i < 10; i++) for (const l of tops) if (l[i]) mix.push(l[i])
        extra = [...extra, ...fresh(mix).slice(0, 10 - extra.length)]
      }
      return add(extra)
    })().catch(() => false).finally(() => { filling = null })
    return filling
  }

  let lastPos = 0
  const setPosition = (time, duration) => {
    if (!navigator.mediaSession?.setPositionState || !duration || !isFinite(duration) || Math.abs(time - lastPos) < 5) return
    lastPos = time
    try { navigator.mediaSession.setPositionState({ duration, position: Math.min(time, duration), playbackRate: 1 }) } catch { /* no soportado */ }
  }

  engine.on({
    // La animación de "preparando" se ve al menos un momento aunque la canción arranque al instante
    onPlay: () => {
      errors = 0
      const my = seq, wait = 900 - (Date.now() - loadedAt)
      set({ isPlaying: true })
      if (wait > 0) setTimeout(() => { if (my === seq) set({ loading: false }) }, wait); else set({ loading: false })
      prefetch()
    },
    onPause: () => set({ isPlaying: false }),
    onBuffer: (b) => set({ loading: b }),
    onTime: (time, duration) => { setPosition(time, duration); set((s) => ({ time, duration: duration && isFinite(duration) ? duration : s.duration })) },
    onEnded: () => get().next(true),
    onError: () => fail(seq),
  })

  // La vista web de la app Android puede no traer Media Session: se pone una mínima,
  // porque la app lee de ahí el título, el artista y la carátula para la pantalla de bloqueo
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') {
    try {
      window.MediaMetadata = function (o) { Object.assign(this, o) }
      Object.defineProperty(navigator, 'mediaSession', { configurable: true, value: { metadata: null, setActionHandler() {}, setPositionState() {} } })
    } catch { /* se queda sin mandos */ }
  }

  const setMediaSession = (t) => {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: t.album || 'Esputi',
        artwork: t.cover ? [{ src: t.cover, sizes: '480x480' }] : [],
      })
      // Play y pausa se dejan al navegador: así su orden llega también al reproductor
      // incrustado como un gesto del usuario (necesario con la pantalla apagada)
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
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
    autoFrom: null, // desde qué posición de la cola las canciones las ha añadido la música infinita
    local: [],      // pistas de la cola que ya están descargadas en el móvil (buffer local)
    localBytes: 0,  // lo que ocupan

    playList(tracks, start = 0, context = null) {
      if (!tracks?.length) return
      errors = 0
      gen++
      plan = []
      // Desde una búsqueda se pone solo la canción elegida: lo que sigue lo trae la música infinita
      // (su artista y parecidos) en vez del resto de resultados, que suelen ser versiones de lo mismo
      if (context?.type === 'search' && getSettings().autoplay !== false) { tracks = [tracks[Math.max(0, start)]]; start = 0 }
      set({ queue: tracks.slice(), index: Math.max(0, start), context, history: [], autoFrom: null })
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
      if (s.shuffle && s.queue.length > 1) {
        // Aleatorio sin repetir: primero las que aún no han sonado (si ya estaba sorteada, esa)
        const played = new Set([...s.history, s.index])
        const planned = plan.shift()
        if (planned != null && planned < s.queue.length && !played.has(planned)) i = planned
        else {
          plan = []
          let rest = s.queue.map((_, k) => k).filter((k) => !played.has(k))
          if (!rest.length && (s.repeat === 'all' || !auto)) rest = s.queue.map((_, k) => k).filter((k) => k !== s.index)
          i = rest.length ? rest[Math.floor(Math.random() * rest.length)] : s.queue.length
        }
      } else i = s.index + 1
      if (i >= s.queue.length) {
        if (s.repeat === 'all' || !auto) i = 0
        else {
          const stop = () => { engine.pause(); engine.seek(0); set({ isPlaying: false, time: 0 }) }
          // Fin de la cola: se pide más música y, si llega, se sigue
          if (afterError) stop()
          else refill().then(() => { if (get().index !== s.index) return; if (get().queue.length > s.queue.length) get().next(true); else stop() })
          return
        }
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
      plan = []
      set({ index: Math.min(i, s.queue.length - 1), history })
      load(true)
    },
    jump(i) {
      const s = get()
      if (i < 0 || i >= s.queue.length) return
      plan = []
      set({ index: i, history: [...s.history, s.index].slice(-50) })
      load(true)
    },
    seek(t) { engine.seek(t); set({ time: t }) },
    setVolume(v) { engine.setVolume(v); set({ volume: v, muted: false }); store.set('esputi.volume', v) },
    toggleMute() { const s = get(); engine.setVolume(s.muted ? s.volume : 0); set({ muted: !s.muted }) },
    toggleShuffle: () => { set((s) => ({ shuffle: !s.shuffle })); replan() },
    cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
    addToQueue(t) {
      const empty = !get().queue.length
      // Lo que añade el usuario va antes de lo que puso la música infinita
      set((s) => {
        const at = s.autoFrom ?? s.queue.length
        return { queue: [...s.queue.slice(0, at), t, ...s.queue.slice(at)], autoFrom: s.autoFrom == null ? null : at + 1 }
      })
      if (empty) { set({ index: 0 }); load(true) } else { toast('Añadida a la cola'); replan() }
    },
    playNext(t) {
      const s = get()
      if (!s.queue.length) return get().addToQueue(t)
      const q = s.queue.slice(); q.splice(s.index + 1, 0, t)
      set({ queue: q, autoFrom: s.autoFrom != null && s.autoFrom > s.index ? s.autoFrom + 1 : s.autoFrom }); toast('Sonará a continuación')
      // En aleatorio "a continuación" es de verdad la siguiente
      if (s.shuffle) { plan = [s.index + 1]; prefetch() } else replan()
    },
    removeAt(i) {
      const s = get()
      if (i === s.index) return
      set({
        queue: s.queue.filter((_, k) => k !== i), index: i < s.index ? s.index - 1 : s.index, history: [],
        autoFrom: s.autoFrom != null && i < s.autoFrom ? s.autoFrom - 1 : s.autoFrom,
      })
      replan()
    },
    stop() { seq++; gen++; engine.stop(); pairs = []; plan = []; buffer.clear(); set({ queue: [], index: -1, current: null, resolved: null, isPlaying: false, time: 0, duration: 0, autoFrom: null, local: [], localBytes: 0 }) },
  }
})
