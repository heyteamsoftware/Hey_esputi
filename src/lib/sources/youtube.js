// YouTube: reproducción con el reproductor oficial incrustado (IFrame API).
// La búsqueda funciona sin configurar nada a través de nuestra pasarela (api/yt.php).
// Si el usuario pone su propia clave de YouTube Data API en Ajustes, se usa la API oficial.
import { decodeHtml } from '../util'
import { getSettings } from '../settings'

const clean = (s = '') => s.replace(/ - Topic$/, '').replace(/VEVO$/, '').trim()
const track = (sid, title, artist, duration, cover) => ({ id: 'youtube:' + sid, source: 'youtube', sid, title, artist: clean(artist), duration, cover })

async function viaGateway(q, limit) {
  const r = await fetch(import.meta.env.BASE_URL + 'api/yt.php?q=' + encodeURIComponent(q))
  if (!r.ok) throw new Error('YouTube ' + r.status)
  return ((await r.json()).items || []).slice(0, limit).map((v) => track(v.sid, v.title, v.artist, v.duration, v.cover))
}

async function viaOfficialApi(q, limit, key) {
  const u = new URL('https://www.googleapis.com/youtube/v3/search')
  Object.entries({ part: 'snippet', type: 'video', videoEmbeddable: 'true', videoCategoryId: '10', maxResults: limit, q, key })
    .forEach(([k, v]) => u.searchParams.set(k, v))
  const r = await fetch(u)
  if (!r.ok) throw new Error('YouTube ' + r.status)
  return ((await r.json()).items || []).map((it) => track(
    it.id.videoId, decodeHtml(it.snippet.title), decodeHtml(it.snippet.channelTitle), 0,
    it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url || ''))
}

export const youtube = {
  enabled: () => true,
  searchTracks: async (q, limit = 10) => {
    const key = getSettings().ytKey
    if (key) { try { return await viaOfficialApi(q, limit, key) } catch { /* cuota agotada o clave mala: pasarela */ } }
    return viaGateway(q, limit)
  },
}
