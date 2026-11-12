// Buscador. Una búsqueda consulta a la vez el catálogo (los artistas y canciones conocidos)
// y las fuentes abiertas, y lo ordena todo con una sola puntuación:
//   · cuántas palabras de la búsqueda aparecen (la última puede estar a medio escribir)
//   · coincidencias exactas de título, de artista o de "artista + título"
//   · popularidad (posición en el catálogo, reproducciones, seguidores)
//   · menos puntos para karaokes, versiones, directos y remezclas que nadie ha pedido
// Las canciones repetidas (mismo artista y título) se quedan solo con la mejor.
import { norm } from './util'
import { catalog } from './catalog'
import { audius } from './sources/audius'
import { archive } from './sources/archive'
import { youtube } from './sources/youtube'

const JUNK = /\b(karaoke|tribute|tributo|cover|covers|8d|nightcore|slowed|sped up|speed up|reverb|instrumental|made famous|originally performed|in the style of|backing track|ringtone|lullaby|type beat|homenaje)\b/
const VERSION = /\b(remix|mix|edit|live|directo|en vivo|acoustic|acustic[oa]|acústic[oa]|demo|session|sesión|version|versión|bootleg|mashup|rework|flip|stripped|a cappella|acapella)\b/

const wordsOf = (q) => norm(q).split(' ').filter(Boolean)
const has = (hay, w) => ` ${hay} `.includes(` ${w} `)

// Popularidad de 0 a 1, comparable entre fuentes
const fame = (t, i) => {
  if (t.rank) return Math.min(1, t.rank / 1e6)                                // catálogo
  if (t.plays != null) return Math.min(1, Math.log10(t.plays + 1) / 6) * 0.6   // Audius
  return Math.max(0, 0.35 - i * 0.02)                                          // YouTube: solo el orden
}

export function scoreTrack(q, t, i = 0, mainArtist = null) {
  const nq = norm(q), words = wordsOf(q)
  if (!words.length) return 0
  const title = norm(t.title), artist = norm(String(t.artist).split(',')[0]), album = norm(t.album || '')
  const hay = `${artist} ${title}`
  let got = 0, total = 0
  words.forEach((w, k) => {
    const wt = w.length > 2 ? 1 : 0.4
    total += wt
    if (has(hay, w)) got += wt
    else if (k === words.length - 1 && w.length > 1 && ` ${hay}`.includes(' ' + w)) got += wt * 0.8
    else if (has(album, w)) got += wt * 0.4
  })
  const cover = got / total
  let s = cover * 60
  if (`${artist} ${title}` === nq || `${title} ${artist}` === nq) s += 36
  else if (title === nq) s += 30
  else if (title.startsWith(nq + ' ')) s += 12
  if (mainArtist && artist === mainArtist.name) s += mainArtist.exact ? 32 : 18
  else if (artist === nq) s += 16
  s += fame(t, i) * 25
  const raw = String(t.title).toLowerCase(), rq = String(q).toLowerCase()
  if (JUNK.test(raw) && !JUNK.test(rq)) s -= 30
  if (VERSION.test(raw) && !VERSION.test(rq)) s -= 10
  // "Artista - Título" subido por otra persona: es una copia, no el original
  const re = t.source === 'audius' && /^(.+?)\s+[-–]\s+.+$/.exec(String(t.title))
  if (re && norm(re[1]) !== artist && words.some((w) => has(norm(re[1]), w))) s -= 20
  if (t.rank) s += 5
  else if (t.source === 'youtube') s -= 4
  return { s, cover }
}

export function rankTracks(q, list, mainArtist = null) {
  const best = new Map()
  list.forEach((t, i) => {
    const { s, cover } = scoreTrack(q, t, i, mainArtist)
    const key = norm(String(t.artist).split(',')[0]) + '|' + norm(t.title)
    const prev = best.get(key)
    if (!prev || s > prev.s) best.set(key, { t, s, cover })
  })
  const all = [...best.values()].sort((a, b) => b.s - a.s)
  const min = wordsOf(q).length > 1 ? 0.5 : 0.75
  const good = all.filter((x) => x.cover >= min)
  return (good.length >= 4 ? good : all).map((x) => x.t)
}

const plain = (x) => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

export function rankArtists(q, cat = [], users = []) {
  const nq = norm(q), words = wordsOf(q), pq = plain(q)
  const sc = (name, fans, isCat) => {
    const n = norm(name)
    if (!n) return 0
    const m = n === nq ? 100 : n.startsWith(nq + ' ') ? 72 : words.every((w) => has(n, w)) ? 60 : n.startsWith(nq) ? 55
      : words.every((w) => n.includes(w)) ? 42 : 0
    return m ? m + (plain(name) === pq ? 6 : 0) + Math.log10((fans || 0) + 1) * 6 + (isCat ? 4 : 0) : 0
  }
  // Los "artistas" del catálogo sin foto y sin seguidores suelen ser colaboraciones sueltas
  const all = [
    ...cat.filter((a) => a.cover || a.fans >= 100).map((a) => ({ a, s: sc(a.name, a.fans, true) })),
    ...users.map((u) => { const s = sc(u.name, u.followers, false); return { a: u, s: s && s + (u.verified ? 3 : 0) } }),
  ].filter((x) => x.s > 0).sort((x, y) => y.s - x.s)
  // Con el mismo nombre, se queda el más conocido
  const seen = new Set()
  return all.filter((x) => { const k = norm(x.a.name); if (seen.has(k)) return false; seen.add(k); return true }).map((x) => x.a)
}

export function rankAlbums(q, list, mainArtist = null) {
  const nq = norm(q), words = wordsOf(q)
  const sc = (a, i) => {
    const name = norm(a.name), owner = norm(a.owner || '')
    const m = name === nq ? 100 : `${owner} ${name}` === nq || `${name} ${owner}` === nq ? 100 : owner === nq ? 70
      : words.every((w) => has(`${owner} ${name}`, w)) ? 60 : words.some((w) => w.length > 2 && has(`${owner} ${name}`, w)) ? 25 : 5
    return m + (mainArtist && owner === mainArtist.name ? 45 : 0) + (a.record === 'album' ? 8 : 0) - i * 0.5
  }
  const seen = new Set()
  return list.map((a, i) => ({ a, s: sc(a, i) })).sort((x, y) => y.s - x.s).map((x) => x.a)
    .filter((a) => { const k = norm(a.owner || '') + '|' + norm(a.name); if (seen.has(k)) return false; seen.add(k); return true })
}

// "Resultado principal": lo que más probablemente se estaba buscando. Gana lo que mejor
// encaja con lo escrito (exacto > empieza igual) y, a igualdad, lo más conocido.
export function pickTop(q, artists, tracks, albums, rawTracks = []) {
  const nq = norm(q)
  const level = (name) => (name === nq ? 3 : nq.length >= 3 && name.startsWith(nq) ? 2 : 0)
  const cands = []
  const a = artists[0], t = tracks[0], al = albums[0]
  if (a) cands.push({ kind: 'artist', item: a, lv: level(norm(a.name)) || 1, fame: Math.log10((a.fans || a.followers || 0) + 1) * 1.5 - 1.5 })
  if (t) {
    const ti = norm(t.title), ar = norm(String(t.artist).split(',')[0])
    const lv = `${ar} ${ti}` === nq || `${ti} ${ar}` === nq ? 3 : Math.max(level(ti), level(`${ar} ${ti}`) ? 2 : 0) || 1
    cands.push({ kind: 'track', item: t, lv, fame: (t.rank || 0) / 1e6 * 9 + 0.01 })
  }
  if (al) {
    // Un álbum es tan conocido como su canción más escuchada
    const name = norm(al.name), owner = norm(al.owner || '')
    const best = Math.max(0, ...rawTracks.filter((x) => norm(x.album || '') === name && norm(String(x.artist).split(',')[0]) === owner).map((x) => x.rank || 0))
    cands.push({ kind: 'album', item: al, lv: level(norm(al.name)) || 0.5, fame: best / 1e6 * 9 - 0.5 })
  }
  cands.sort((x, y) => y.lv - x.lv || y.fame - x.fame)
  return cands[0] ? { kind: cands[0].kind, item: cands[0].item } : null
}

const late = (p, ms, d = []) => Promise.race([p.catch(() => d), new Promise((r) => setTimeout(() => r(d), ms))])

export async function searchAll(q) {
  const [ct, ca, cal, at, au, apl, ia] = await Promise.all([
    late(catalog.searchTracks(q, 40), 7000), late(catalog.searchArtists(q, 8), 7000), late(catalog.searchAlbums(q, 14), 7000),
    late(audius.searchTracks(q, 20), 6000), late(audius.searchUsers(q, 10), 6000), late(audius.searchPlaylists(q, 20), 6000),
    late(archive.searchAlbums(q), 3500), // Archive puede tardar: si no responde pronto, no retrasa el resto
  ])
  // Si el catálogo no conoce lo buscado (o no responde), se busca directamente en YouTube
  const yt = ct.length < 5 ? await late(youtube.searchTracks(q, 12), 8000) : []
  const artists = rankArtists(q, ca, au)
  // Artista principal de la búsqueda: el primero, si es conocido y se llama como lo escrito
  // (o empieza igual). Sus canciones y álbumes suben.
  const a0 = artists[0], n0 = a0 ? norm(a0.name) : '', nq = norm(q)
  const known = a0 && (a0.fans || a0.followers || 0) >= 3000
  const main = known && n0 === nq ? { name: n0, exact: true } : known && nq.length >= 3 && n0.startsWith(nq) ? { name: n0, exact: false } : null
  const tracks = rankTracks(q, [...ct, ...at, ...yt], main)
  const albums = rankAlbums(q, [...cal, ...apl.filter((p) => p.isAlbum), ...ia], main)
  return { top: pickTop(q, artists, tracks, albums, ct), tracks, artists, albums, pls: apl.filter((p) => !p.isAlbum) }
}
