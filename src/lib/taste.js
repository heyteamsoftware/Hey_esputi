// Gustos del usuario: a partir de sus favoritos, sus playlists (propias y de Spotify)
// y las búsquedas desde las que ha reproducido algo, se deduce qué artistas y
// estilos prefiere para personalizar la portada.
import { norm, store } from './util'
import { audius } from './sources/audius'
import { youtube } from './sources/youtube'

const GENRE_CACHE = 'esputi.artistGenre.v1'
let genreCache = store.get(GENRE_CACHE, {})

// Género de iTunes → género de Audius (los que usa la portada)
const MAP = [
  [/hip.?hop|rap|urbano|trap/i, 'Hip-Hop/Rap'], [/r&b|soul/i, 'R&B/Soul'], [/electr|dance|edm/i, 'Electronic'], [/house/i, 'House'],
  [/techno/i, 'Techno'], [/latin|reggaet|salsa|flamenco|regional/i, 'Latin'], [/metal/i, 'Metal'], [/punk/i, 'Punk'],
  [/alternativ|indie/i, 'Alternative'], [/rock/i, 'Rock'], [/jazz/i, 'Jazz'], [/classical|clásica/i, 'Classical'],
  [/reggae/i, 'Reggae'], [/folk|country|singer|cantautor/i, 'Folk'], [/ambient|new age/i, 'Ambient'], [/funk/i, 'Funk'], [/pop/i, 'Pop'],
]
const toAudius = (g = '') => (MAP.find(([re]) => re.test(g)) || [])[1] || null

export const GENRE_LABEL = {
  'Hip-Hop/Rap': 'Hip-hop y rap', 'R&B/Soul': 'R&B y soul', Electronic: 'Electrónica', House: 'House', Techno: 'Techno', Latin: 'Música latina',
  Metal: 'Metal', Punk: 'Punk', Alternative: 'Alternativa e indie', Rock: 'Rock', Jazz: 'Jazz', Classical: 'Clásica', Reggae: 'Reggae',
  Folk: 'Folk', Ambient: 'Ambient', Funk: 'Funk', Pop: 'Pop', 'Lo-Fi': 'Lo-fi',
}

// Estilo principal de un artista según el catálogo público de iTunes (se cachea)
async function artistGenre(name) {
  const k = norm(name)
  if (k in genreCache) return genreCache[k]
  let g = null
  try {
    const r = await fetch('https://itunes.apple.com/search?entity=musicArtist&limit=1&term=' + encodeURIComponent(name))
    g = toAudius((await r.json()).results?.[0]?.primaryGenreName)
  } catch { return null }
  genreCache[k] = g
  store.set(GENRE_CACHE, genreCache)
  return g
}

// Artistas más presentes en la biblioteca, con peso según de dónde vienen
export function topArtists(lib, max = 6) {
  const n = new Map()
  const add = (artist, w) => {
    const a = String(artist || '').split(',')[0].trim()
    if (!a || /^(desconocido|internet archive)$/i.test(a)) return
    const k = norm(a); if (!k) return
    const e = n.get(k) || { name: a, w: 0 }
    e.w += w; n.set(k, e)
  }
  lib.liked.forEach((t) => add(t.artist, 3))
  lib.playlists.forEach((p) => p.tracks.forEach((t) => add(t.artist, 2)))
  lib.spotify.forEach((p) => p.items.forEach((t) => add(t.artist, 1)))
  return [...n.values()].sort((a, b) => b.w - a.w).slice(0, max).map((e) => e.name)
}

// Firma barata de los gustos: si no cambia, la portada no se recalcula
export const tasteKey = (lib, searches) => topArtists(lib).join('|') + '#' + searches.slice(0, 3).join('|') + '#' + lib.liked.length

const memo = new Map()

// Devuelve { genres: [géneros de Audius ordenados por afinidad], tracks: [canciones "para ti"], seeds }
export function taste(lib, searches) {
  const key = tasteKey(lib, searches)
  if (memo.has(key)) return memo.get(key)
  const p = (async () => {
    const artists = topArtists(lib)
    const score = {}
    const bump = (g, w) => { if (g) score[g] = (score[g] || 0) + w }
    // Estilos de las canciones guardadas que traen género (Audius) y de las búsquedas que nombran uno
    ;[...lib.liked, ...lib.playlists.flatMap((p) => p.tracks)].forEach((t) => bump(toAudius(t.genre), 2))
    searches.forEach((q) => bump(toAudius(q), 2))
    const found = await Promise.all(artists.map(artistGenre))
    found.forEach((g, i) => bump(g, artists.length - i + 1))
    const genres = Object.entries(score).sort((a, b) => b[1] - a[1]).map((e) => e[0])

    // "Hecho para ti": más canciones de sus artistas y de lo último que buscó
    const seeds = [...new Set([...searches.slice(0, 2), ...artists.slice(0, 4)])].slice(0, 5)
    const lists = await Promise.all(seeds.map((s) => Promise.all([
      audius.searchTracks(s, 4).catch(() => []), youtube.searchTracks(s, 6).catch(() => []),
    ]).then(([a, y]) => [...a, ...y].filter((t) => t.duration > 60 && t.duration < 600))))
    const have = new Set([...lib.liked.map((t) => t.id)])
    const tracks = []
    for (let i = 0; i < 8; i++) for (const l of lists) { const t = l[i]; if (t && !have.has(t.id)) { have.add(t.id); tracks.push(t) } }
    return { genres, tracks: tracks.slice(0, 20), seeds }
  })()
  memo.set(key, p)
  p.catch(() => memo.delete(key))
  return p
}
