// Mapeo Spotify → fuente abierta.
// Dado (artista, título, duración) de Spotify busca la mejor coincidencia en
// Audius, YouTube e Internet Archive (en ese orden), y cachea el resultado.
import { norm, store } from './util'
import { audius } from './sources/audius'
import { archive } from './sources/archive'
import { youtube } from './sources/youtube'

const CACHE_KEY = 'esputi.match.v2'
const MISS_TTL = 24 * 3600 * 1000
let cache = store.get(CACHE_KEY, {})
const pending = new Map()
// Pistas que fallaron al reproducirse (p. ej. vídeos que no permiten incrustarse): no se vuelven a elegir
const BAN_KEY = 'esputi.banned.v1'
let banned = new Set(store.get(BAN_KEY, []))
let saveTimer

const persist = () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const keys = Object.keys(cache)
    if (keys.length > 4000) keys.slice(0, keys.length - 4000).forEach((k) => delete cache[k])
    store.set(CACHE_KEY, cache)
  }, 800)
}

export const matchKey = ({ artist, title }) => `${norm(String(artist).split(',')[0])} - ${norm(title)}`

// undefined = sin buscar todavía · null = buscada sin éxito · objeto = pista encontrada
export const cachedMatch = (q) => {
  const e = cache[matchKey(q)]
  if (!e) return undefined
  if (!e.t && Date.now() - e.at > MISS_TTL) return undefined
  return e.t
}

const tokens = (s) => norm(s).split(' ').filter(Boolean)

// Puntuación (aprox. 0..1) de un candidato frente a la canción de Spotify
export function score(q, c) {
  const qt = tokens(q.title), qa = tokens(String(q.artist).split(',')[0])
  if (!qt.length) return 0
  const hay = ' ' + norm(`${c.artist} ${c.title}`) + ' '
  const ct = norm(c.title)
  const titleHit = qt.filter((w) => hay.includes(' ' + w + ' ')).length / qt.length
  const artistHit = qa.length ? qa.filter((w) => hay.includes(' ' + w + ' ')).length / qa.length : 0.5
  let s = titleHit * 0.55 + artistHit * 0.35
  // El título del candidato no debería traer mucho texto extra (remixes, covers, directos)
  const extra = tokens(ct).filter((w) => !qt.includes(w) && !qa.includes(w)).length
  s -= Math.min(extra, 6) * 0.03
  const junk = /\b(cover|karaoke|remix|mix|edit|bootleg|flip|mashup|rework|nightcore|8d|slowed|sped up|instrumental|tribute|tributo|live|directo|en vivo|acustic[oa]|acústic[oa]|reaction|reacci[oó]n|lyrics?|letra)\b/
  if (junk.test(c.title.toLowerCase()) && !junk.test(String(q.title).toLowerCase())) s -= 0.25
  if (q.duration && c.duration) {
    const d = Math.abs(q.duration - c.duration)
    s += d <= 3 ? 0.1 : d <= 10 ? 0.05 : d > 45 ? -0.2 : 0
  } else s += 0.03
  return s
}

async function find(q) {
  const artist = String(q.artist).split(',')[0]
  let failed = 0
  const safe = (p) => p.catch(() => { failed++; return [] })
  // Umbral mínimo por fuente y pequeña ventaja para las que suenan con la pantalla apagada
  const RULES = { audius: [0.8, 0.05], archive: [0.8, 0.05], youtube: [0.7, 0] }
  const pick = (lists) => {
    let top = null, ts = 0
    for (const c of lists.flat()) {
      if (banned.has(c.id)) continue
      const [min, bonus] = RULES[c.source]
      const s = score(q, c)
      if (s >= min && s + bonus > ts) { ts = s + bonus; top = c }
    }
    return top
  }

  // 1.ª pasada: todas las fuentes a la vez y se elige la mejor coincidencia global
  let m = pick(await Promise.all([
    safe(audius.searchTracks(`${q.title} ${artist}`, 10)),
    safe(youtube.searchTracks(`${artist} - ${q.title}`, 10)),
    safe(archive.searchTracks(`title:(${norm(q.title)}) AND creator:(${norm(artist)})`)),
  ]))
  // 2.ª pasada, con calma: otras formas de escribir la búsqueda
  if (!m) {
    m = pick(await Promise.all([
      safe(audius.searchTracks(q.title, 15)),
      safe(youtube.searchTracks(`${q.title} ${artist} audio`, 10)),
    ]))
  }
  if (!m && failed) throw new Error('fuentes no disponibles') // no se da por perdida: se reintentará
  return m
}

export function matchTrack(q) {
  const key = matchKey(q)
  const hit = cachedMatch(q)
  if (hit !== undefined) return Promise.resolve(hit)
  if (pending.has(key)) return pending.get(key)
  const p = find(q).then((t) => {
    cache[key] = { t, at: Date.now() }
    persist(); pending.delete(key)
    return t
  }, () => { pending.delete(key); return null }) // fallo de red: no se cachea
  pending.set(key, p)
  return p
}

// La coincidencia elegida no se pudo reproducir: se descarta y se olvida para volver a buscar
export function rejectMatch(q, track) {
  banned.add(track.id)
  store.set(BAN_KEY, [...banned].slice(-500))
  delete cache[matchKey(q)]
  persist()
}

export const clearMisses = () => { for (const k of Object.keys(cache)) if (!cache[k].t) delete cache[k]; persist() }
