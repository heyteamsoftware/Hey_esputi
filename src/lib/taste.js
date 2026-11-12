// Gustos del usuario: a partir de sus favoritos, sus playlists (propias y de Spotify)
// y las búsquedas desde las que ha reproducido algo, se deduce qué artistas y
// estilos prefiere para personalizar la portada.
import { norm, store } from './util'
import { audius } from './sources/audius'
import { youtube } from './sources/youtube'
import { catalog } from './catalog'

const GENRE_CACHE = 'esputi.artistGenre.v2'
let genreCache = store.get(GENRE_CACHE, {})

// Nombre de género (de iTunes, Apple Music o Audius) → estilo de Esputi. Va de lo concreto a lo general.
const MAP = [
  [/k-?pop/i, 'K-Pop'], [/urbano latino|reggaet|reguet/i, 'Reggaeton'], [/\btrap\b/i, 'Trap'], [/flamenco|rumba/i, 'Flamenco'],
  [/salsa|tropical|bachata/i, 'Salsa'], [/country/i, 'Country'], [/blues/i, 'Blues'], [/soundtrack|banda sonora|score/i, 'Soundtrack'],
  [/trance/i, 'Trance'], [/disco/i, 'Disco'], [/afrobeat|afro-?pop/i, 'Afrobeats'], [/cantautor|singer/i, 'Cantautores'],
  [/hip.?hop|rap|urbano/i, 'Hip-Hop/Rap'], [/r&b|soul/i, 'R&B/Soul'], [/house/i, 'House'], [/techno/i, 'Techno'],
  [/dubstep/i, 'Dubstep'], [/drum.?&?.?bass|jungle/i, 'Drum & Bass'], [/lo-?fi/i, 'Lo-Fi'], [/electr|dance|edm/i, 'Electronic'],
  [/latin|regional/i, 'Latin'], [/metal/i, 'Metal'], [/punk/i, 'Punk'],
  [/alternativ|indie/i, 'Alternative'], [/rock/i, 'Rock'], [/jazz/i, 'Jazz'], [/classical|clásica/i, 'Classical'],
  [/reggae/i, 'Reggae'], [/folk/i, 'Folk'], [/ambient|new age/i, 'Ambient'], [/funk/i, 'Funk'], [/pop/i, 'Pop'],
]
const toStyle = (g = '') => (MAP.find(([re]) => re.test(g)) || [])[1] || null
// Quien excluye un estilo general tampoco quiere ver sus variantes
const PARENT = { Reggaeton: 'Latin', Salsa: 'Latin', Trap: 'Hip-Hop/Rap', Trance: 'Electronic', Eurodance: 'Electronic' }

export const GENRE_LABEL = {
  'Hip-Hop/Rap': 'Hip-hop y rap', 'R&B/Soul': 'R&B y soul', Electronic: 'Electrónica', House: 'House', Techno: 'Techno', Latin: 'Música latina',
  Metal: 'Metal', Punk: 'Punk', Alternative: 'Alternativa e indie', Rock: 'Rock', Jazz: 'Jazz', Classical: 'Clásica', Reggae: 'Reggae',
  Folk: 'Folk', Ambient: 'Ambient', Funk: 'Funk', Pop: 'Pop', 'Lo-Fi': 'Lo-fi', Dubstep: 'Dubstep', 'Drum & Bass': 'Drum & bass',
  Reggaeton: 'Reguetón', Trap: 'Trap y urbano', Flamenco: 'Flamenco y rumba', 'K-Pop': 'K-pop', Country: 'Country', Blues: 'Blues',
  Disco: 'Disco', Salsa: 'Salsa y bachata', '80s': 'Años 80', '90s': 'Años 90', '2000s': 'Años 2000', Soundtrack: 'Bandas sonoras',
  Trance: 'Trance', Cantautores: 'Cantautores', Canarias: 'Música canaria', Afrobeats: 'Afrobeats', Eurodance: 'Dance de los 90',
}

// Todos los estilos que se pueden elegir en la encuesta de gustos, de más a menos comunes
export const STYLES = [
  'Pop', 'Rock', 'Reggaeton', 'Hip-Hop/Rap', 'Trap', 'Latin', 'Electronic', 'Alternative', 'Flamenco', 'Canarias', 'Cantautores', '80s', '90s', '2000s',
  'House', 'Techno', 'Eurodance', 'Trance', 'Metal', 'Punk', 'R&B/Soul', 'Funk', 'Disco', 'Salsa', 'Reggae', 'K-Pop', 'Afrobeats', 'Jazz', 'Blues',
  'Country', 'Folk', 'Classical', 'Soundtrack', 'Lo-Fi', 'Ambient', 'Dubstep', 'Drum & Bass',
]

// ¿La pista es de un estilo que el usuario ha excluido en la encuesta?
export const excluded = (t, dislikes) => {
  if (!t.genre || !dislikes?.length) return false
  const s = toStyle(t.genre)
  return dislikes.includes(t.genre) || dislikes.includes(s) || dislikes.includes(PARENT[s])
}

// Estilo principal de un artista según el catálogo público de iTunes (se cachea)
async function artistGenre(name) {
  const k = norm(name)
  if (k in genreCache) return genreCache[k]
  let g = null
  try {
    const r = await fetch('https://itunes.apple.com/search?entity=musicArtist&limit=1&term=' + encodeURIComponent(name))
    g = toStyle((await r.json()).results?.[0]?.primaryGenreName)
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
  + '#' + (lib.prefs ? lib.prefs.likes.join('|') + '!' + lib.prefs.dislikes.join('|') : '')

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
    ;[...lib.liked, ...lib.playlists.flatMap((p) => p.tracks)].forEach((t) => bump(toStyle(t.genre), 2))
    searches.forEach((q) => bump(toStyle(q), 2))
    const found = await Promise.all(artists.map(artistGenre))
    found.forEach((g, i) => bump(g, artists.length - i + 1))
    // La encuesta manda: lo elegido va primero y lo excluido no aparece
    const likes = lib.prefs?.likes || [], dislikes = lib.prefs?.dislikes || []
    likes.forEach((g, i) => bump(g, 100 - i))
    const genres = Object.entries(score).sort((a, b) => b[1] - a[1]).map((e) => e[0]).filter((g) => !dislikes.includes(g))

    // "Hecho para ti": más canciones de sus artistas y de lo último que buscó
    const seeds = [...new Set([...searches.slice(0, 2), ...artists.slice(0, 4)])].slice(0, 5)
    const lists = await Promise.all(seeds.map(async (s) => {
      // Primero el catálogo: las canciones más escuchadas de ese artista o de esa búsqueda
      const cat = await catalog.searchTracks(s, 15).catch(() => [])
      if (cat.length) {
        const ns = norm(s), own = cat.filter((t) => norm(t.artist) === ns), seen = new Set()
        return (own.length >= 3 ? own : cat).sort((a, b) => b.rank - a.rank)
          .filter((t) => { const k = norm(t.title); if (seen.has(k)) return false; seen.add(k); return true })
      }
      const [a, y] = await Promise.all([audius.searchTracks(s, 4).catch(() => []), youtube.searchTracks(s, 6).catch(() => [])])
      return [...a, ...y].filter((t) => t.duration > 60 && t.duration < 600)
    }))
    const have = new Set([...lib.liked.map((t) => t.id)])
    const tracks = []
    for (let i = 0; i < 8; i++) for (const l of lists) { const t = l[i]; if (t && !have.has(t.id) && !excluded(t, dislikes)) { have.add(t.id); tracks.push(t) } }
    return { genres, tracks: tracks.slice(0, 20), seeds }
  })()
  memo.set(key, p)
  p.catch(() => memo.delete(key))
  return p
}
