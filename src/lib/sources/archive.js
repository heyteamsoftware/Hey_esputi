// Internet Archive: biblioteca digital pública, API abierta y sin clave. https://archive.org/developers
const IA = 'https://archive.org'
const first = (v) => (Array.isArray(v) ? v[0] : v) || ''
const img = (id) => `${IA}/services/img/${id}`
const metaCache = new Map()
// Solo colecciones de música (se excluyen radio, podcasts, audiolibros…)
const MUSIC = 'collection:(netlabels OR audio_music OR 78rpm OR etree)'
// Todas las palabras de la búsqueda deben aparecer
const allWords = (q) => String(q).replace(/[^\p{L}\p{N} ]+/gu, ' ').split(' ').filter(Boolean).join(' AND ')

async function search(q, rows = 20) {
  const u = new URL(IA + '/advancedsearch.php')
  u.searchParams.set('q', `${q} AND mediatype:audio AND format:"VBR MP3"`)
  ;['identifier', 'title', 'creator'].forEach((f) => u.searchParams.append('fl[]', f))
  u.searchParams.append('sort[]', 'downloads desc')
  u.searchParams.set('rows', rows)
  u.searchParams.set('output', 'json')
  const r = await fetch(u)
  if (!r.ok) throw new Error('Archive ' + r.status)
  return (await r.json()).response?.docs || []
}

async function files(identifier) {
  if (metaCache.has(identifier)) return metaCache.get(identifier)
  const m = await (await fetch(`${IA}/metadata/${identifier}`)).json()
  const mp3 = (m.files || []).filter((f) => /\.mp3$/i.test(f.name) && /mp3/i.test(f.format || ''))
  const res = { meta: m.metadata || {}, mp3 }
  metaCache.set(identifier, res)
  return res
}

const fileUrl = (identifier, name) => `${IA}/download/${identifier}/${name.split('/').map(encodeURIComponent).join('/')}`

export const archive = {
  // Cada resultado es un "item" (álbum o grabación); se reproduce su primera pista
  searchTracks: async (q) => (await search(`(${q}) AND ${MUSIC}`)).map((d) => ({
    id: 'archive:' + d.identifier, source: 'archive', sid: d.identifier,
    title: first(d.title) || d.identifier, artist: first(d.creator) || 'Internet Archive',
    duration: 0, cover: img(d.identifier), albumId: d.identifier,
  })),
  searchAlbums: async (q, rows = 12) => (await search(`(${allWords(q)}) AND ${MUSIC}`, rows)).map((d) => ({
    type: 'archive', id: d.identifier, name: first(d.title) || d.identifier, owner: first(d.creator) || 'Internet Archive', cover: img(d.identifier),
  })),
  featured: async (rows = 12) => (await search('collection:netlabels', rows)).map((d) => ({
    type: 'archive', id: d.identifier, name: first(d.title) || d.identifier, owner: first(d.creator) || 'Netlabel', cover: img(d.identifier),
  })),
  album: async (identifier) => {
    const { meta, mp3 } = await files(identifier)
    const artist = first(meta.creator) || 'Internet Archive'
    return {
      type: 'archive', id: identifier, name: first(meta.title) || identifier, owner: artist, cover: img(identifier),
      description: 'Internet Archive',
      tracks: mp3.map((f) => ({
        id: `archive:${identifier}/${f.name}`, source: 'archive', sid: `${identifier}/${f.name}`,
        title: f.title || f.name.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' '),
        artist: f.artist || f.creator || artist, duration: Math.round(parseFloat(f.length) || 0), cover: img(identifier), albumId: identifier,
      })),
    }
  },
  // Devuelve la URL de audio de una pista
  resolve: async (sid) => {
    const i = sid.indexOf('/')
    if (i > 0) return fileUrl(sid.slice(0, i), sid.slice(i + 1))
    const { mp3 } = await files(sid)
    if (!mp3.length) throw new Error('Sin audio')
    return fileUrl(sid, mp3[0].name)
  },
}
