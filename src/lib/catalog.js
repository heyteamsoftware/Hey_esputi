// Catálogo musical: canciones, artistas, álbumes y listas de éxitos "de verdad" (los famosos),
// servidos como texto por nuestra pasarela (api/cat.php). Cada canción del catálogo es una
// pista "pendiente": al reproducirla, el emparejador le busca el audio en las fuentes abiertas.
import { norm } from './util'

const API = import.meta.env.BASE_URL + 'api/cat.php'
const mem = new Map()

function get(p, params = {}) {
  const u = API + '?p=' + encodeURIComponent(p) + Object.entries(params).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('')
  if (mem.has(u)) return mem.get(u)
  const pr = fetch(u).then((r) => { if (!r.ok) throw new Error('Catálogo ' + r.status); return r.json() })
  mem.set(u, pr)
  pr.catch(() => mem.delete(u))
  if (mem.size > 300) mem.delete(mem.keys().next().value)
  return pr
}

export const catTrack = (t) => ({
  id: 'cat:' + t.id, source: 'pending', sid: String(t.id), title: t.title, artist: t.artist,
  artistId: t.artistId ? 'cat:' + t.artistId : undefined, album: t.album || '', albumId: t.albumId ? 'cat:' + t.albumId : undefined,
  duration: t.duration || 0, cover: t.cover || '', rank: t.rank || 0,
  q: { title: t.title, artist: t.artist, duration: t.duration || 0 },
})
const catArtist = (a) => ({ id: 'cat:' + a.id, name: a.name, cover: a.cover.includes('/artist//') ? '' : a.cover, fans: a.fans || 0, catalog: true })
const KIND = { album: 'Álbum', single: 'Sencillo', ep: 'EP', compile: 'Recopilatorio' }
const catAlbum = (a) => ({ type: 'album', id: String(a.id), name: a.name, owner: a.artist || '', cover: a.cover, year: a.year || '', kind: KIND[a.kind] || 'Álbum', record: a.kind || 'album' })

// Estilo de la encuesta → lista de éxitos de España (listas públicas de Apple) y,
// de reserva, la lista equivalente del catálogo
export const CHART = {
  Pop: 14, 'Hip-Hop/Rap': 18, Rock: 21, Electronic: 7, House: 17, Latin: 12, Jazz: 11, 'R&B/Soul': 15,
  Alternative: 20, Metal: 1153, Reggae: 24, Classical: 5, Folk: 10,
  Reggaeton: 1119, 'K-Pop': 51, Country: 6, Blues: 2, Soundtrack: 16, Salsa: 1124,
}
const CHART_ALT = {
  Pop: 132, 'Hip-Hop/Rap': 116, Rock: 152, Electronic: 106, House: 113, Latin: 197, Jazz: 129, 'R&B/Soul': 165,
  Alternative: 85, Metal: 464, Reggae: 144, Classical: 98, Folk: 466,
}

async function spainChart(genre, limit) {
  const u = 'https://itunes.apple.com/es/rss/topsongs/limit=' + limit + (CHART[genre] ? '/genre=' + CHART[genre] : '') + '/json'
  if (!mem.has(u)) { const pr = fetch(u).then((r) => { if (!r.ok) throw new Error('Listas ' + r.status); return r.json() }); mem.set(u, pr); pr.catch(() => mem.delete(u)) }
  const list = (await mem.get(u)).feed?.entry || []
  return list.map((e) => {
    const title = e['im:name']?.label || '', artist = e['im:artist']?.label || ''
    const album = (e['im:collection']?.['im:name']?.label || '').replace(/ - (Single|EP)$/, '')
    const img = e['im:image'] || []
    return {
      id: 'it:' + (e.id?.attributes?.['im:id'] || title + artist), source: 'pending', sid: String(e.id?.attributes?.['im:id'] || ''), title, artist, album,
      genre: e.category?.attributes?.label || '',
      duration: 0, cover: (img[img.length - 1]?.label || '').replace('170x170', '300x300'),
      // Para buscar el audio basta el primer artista de la colaboración
      q: { title, artist: artist.split(/,| & /)[0].trim(), duration: 0 },
    }
  }).filter((t) => t.title && t.artist)
}

const items = (r) => r.items || []
// Lo más escuchado ahora mismo en España (lista pública de Apple Music, a través de la pasarela)
const topSpain = async (limit) => items(await get('top')).slice(0, limit).map((t) => ({
  id: 'it:' + t.id, source: 'pending', sid: String(t.id), title: t.title, artist: t.artist, album: '', duration: 0, cover: t.cover, genre: t.genre || '',
  q: { title: t.title, artist: t.artist.split(/,| & /)[0].trim(), duration: 0 },
}))
// La misma canción suele venir repetida (sencillo, álbum, reedición): se queda la primera
const uniq = (list) => { const seen = new Set(); return list.filter((t) => { const k = norm(t.artist) + '|' + norm(t.title); if (seen.has(k)) return false; seen.add(k); return true }) }
export const catalog = {
  searchTracks: async (q, limit = 40) => items(await get('search', { q, limit })).map(catTrack),
  searchArtists: async (q, limit = 8) => items(await get('search/artist', { q, limit })).map(catArtist),
  searchAlbums: async (q, limit = 14) => items(await get('search/album', { q, limit })).map(catAlbum),
  artist: async (id) => catArtist((await get('artist/' + id)).item),
  artistTop: async (id, limit = 30) => uniq(items(await get(`artist/${id}/top`, { limit: limit + 15 })).map(catTrack)).slice(0, limit),
  artistAlbums: async (id, name) => items(await get(`artist/${id}/albums`, { limit: 100 })).map((a) => ({ ...catAlbum(a), owner: name || '' })),
  related: async (id) => items(await get(`artist/${id}/related`, { limit: 12 })).map(catArtist),
  radio: async (id) => uniq(items(await get(`artist/${id}/radio`, { limit: 40 })).map(catTrack)),
  chart: async (genre = '', limit = 40) => {
    // General: lo más escuchado en España; por estilo: la lista de ventas de ese estilo
    const top = genre ? [] : await topSpain(limit).catch(() => [])
    const es = top.length ? top : await spainChart(genre, limit).catch(() => [])
    return uniq(es.length ? es : items(await get(`chart/${CHART_ALT[genre] || 0}/tracks`, { limit })).map(catTrack))
  },
  album: async (id) => {
    const a = (await get('album/' + id)).item
    return {
      ...catAlbum(a), ownerId: a.artistId ? 'cat:' + a.artistId : undefined, cover: a.big || a.cover, genre: a.genre || '',
      tracks: a.tracks.map((t) => catTrack({ ...t, cover: a.cover })),
    }
  },
  // Artista del catálogo que se llama exactamente así (para enlaces antiguos y canciones de otras fuentes)
  artistByName: async (name) => {
    const list = await catalog.searchArtists(name, 5)
    const n = name.trim().toLowerCase()
    return list.find((a) => a.name.toLowerCase() === n) || null
  },
}
