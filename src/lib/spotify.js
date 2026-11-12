// Cliente de la API web oficial de Spotify, 100 % en el navegador (Authorization Code + PKCE).
// Solo se leen metadatos de playlists; nunca se reproduce audio de Spotify.
import { store } from './util'
import { getSettings } from './settings'

const TOKEN_KEY = 'esputi.spotify'
const VERIFIER_KEY = 'esputi.spotify.verifier'
const SCOPES = 'playlist-read-private playlist-read-collaborative'
const API = 'https://api.spotify.com/v1'

export const redirectUri = () => location.origin + import.meta.env.BASE_URL
export const isConnected = () => { const t = store.get(TOKEN_KEY); return !!t && (!!t.refresh || t.exp > Date.now()) }
export const disconnect = () => store.del(TOKEN_KEY)

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function connect() {
  const clientId = getSettings().spotifyClientId
  if (!clientId) throw new Error('Falta el Client ID de Spotify (Ajustes)')
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)))
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  store.set(VERIFIER_KEY, verifier)
  const u = new URL('https://accounts.spotify.com/authorize')
  Object.entries({
    client_id: clientId, response_type: 'code', redirect_uri: redirectUri(),
    code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES,
  }).forEach(([k, v]) => u.searchParams.set(k, v))
  location.assign(u)
}

async function tokenRequest(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: getSettings().spotifyClientId, ...params }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error_description || 'Spotify rechazó la conexión')
  const prev = store.get(TOKEN_KEY, {})
  store.set(TOKEN_KEY, { access: j.access_token, refresh: j.refresh_token || prev.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 })
}

// Se llama al arrancar: si volvemos de Spotify con ?code=..., lo canjea por un token
export async function handleCallback() {
  const p = new URLSearchParams(location.search)
  const code = p.get('code'), error = p.get('error')
  if (!code && !error) return null
  history.replaceState(null, '', location.pathname + '#/sync')
  if (error) return { error: 'Spotify: conexión cancelada' }
  const verifier = store.get(VERIFIER_KEY)
  store.del(VERIFIER_KEY)
  try {
    await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier })
    return { ok: true }
  } catch (e) { return { error: e.message } }
}

async function accessToken() {
  const t = store.get(TOKEN_KEY)
  if (!t) throw new Error('Conecta tu cuenta de Spotify')
  if (t.exp > Date.now()) return t.access
  if (!t.refresh) { disconnect(); throw new Error('La sesión de Spotify ha caducado') }
  try { await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh }) } catch (e) { disconnect(); throw e }
  return store.get(TOKEN_KEY).access
}

async function get(path) {
  const r = await fetch(path.startsWith('http') ? path : API + path, { headers: { Authorization: 'Bearer ' + (await accessToken()) } })
  if (r.status === 401) { disconnect(); throw new Error('La sesión de Spotify ha caducado') }
  if (r.status === 429) throw new Error('Spotify pide esperar un momento')
  if (!r.ok) {
    const e = new Error(r.status === 404 ? 'Playlist no encontrada o sin acceso' : r.status === 403 ? 'Spotify no permite leer esta playlist con tu cuenta' : 'Error de Spotify ' + r.status)
    e.status = r.status
    throw e
  }
  return r.json()
}

export const parsePlaylistId = (text = '') => {
  const s = String(text).trim()
  const m = s.match(/playlist[/:]([A-Za-z0-9]{16,})/) || s.match(/^([A-Za-z0-9]{22})$/)
  return m ? m[1] : null
}

export const me = () => get('/me')

export const snapshotOf = async (id) => (await get(`/playlists/${id}?fields=snapshot_id`)).snapshot_id

const mapItem = (it) => {
  const t = it?.item || it?.track
  if (!t || !t.id || (t.type && t.type !== 'track')) return null
  return {
    sid: t.id, title: t.name, artist: (t.artists || []).map((a) => a.name).join(', '),
    album: t.album?.name || '', cover: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || '',
    duration: Math.round((t.duration_ms || 0) / 1000),
  }
}

// Descarga la playlist completa (metadatos + todas las canciones, paginadas)
export async function fetchPlaylist(id) {
  const meta = await get(`/playlists/${id}?fields=id,name,description,snapshot_id,images,owner(display_name)`)
  const items = []
  // Spotify renombró /tracks a /items; se prueba el nuevo y se cae al antiguo
  let seg = 'items'
  let url = `/playlists/${id}/${seg}?limit=50&offset=0`
  while (url) {
    let page
    try { page = await get(url) } catch (e) {
      if (seg === 'items' && !items.length && (e.status === 404 || e.status === 400)) { seg = 'tracks'; url = `/playlists/${id}/tracks?limit=50&offset=0`; continue }
      throw e
    }
    for (const it of page.items || []) { const m = mapItem(it); if (m) items.push(m) }
    url = page.next || null
    if (items.length >= 2000) break
  }
  return {
    id: meta.id || id, name: meta.name || 'Playlist de Spotify', description: (meta.description || '').replace(/<[^>]+>/g, ''),
    image: meta.images?.[0]?.url || '', owner: meta.owner?.display_name || 'Spotify',
    snapshot: meta.snapshot_id, items, syncedAt: Date.now(),
  }
}

// Datos públicos de la playlist (sin cuenta), a través de nuestra pasarela de solo lectura
export async function fetchPublic(id) {
  let r
  try { r = await fetch(import.meta.env.BASE_URL + 'api/spotify.php?id=' + encodeURIComponent(id)) } catch { throw new Error('No hay conexión con el servidor') }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'No se pudo leer la playlist')
  return { ...j, syncedAt: Date.now() }
}

// Canción de Spotify → entrada de cola "pendiente": su audio se resuelve al vuelo con el matcher
export const spTrack = (it) => ({
  id: 'sp:' + it.sid, source: 'pending',
  q: { title: it.title, artist: it.artist, duration: it.duration },
  title: it.title, artist: it.artist, album: it.album, cover: it.cover, duration: it.duration,
})
