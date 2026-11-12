// Spotify Live Sync: importa playlists a partir de su URL y detecta cambios.
// - Sin cuenta: se leen los datos públicos de la playlist (api/spotify.php) y se
//   compara una huella de sus canciones.
// - Con la cuenta conectada (opcional): API oficial y su snapshot_id; sirve para
//   playlists privadas y de más de 100 canciones.
import { fetchPlaylist, fetchPublic, isConnected, parsePlaylistId, snapshotOf } from './spotify'
import { useLib } from '../store/library'
import { toast, useUI } from '../store/ui'

const INTERVAL = 30000        // con la API oficial
const PUBLIC_EVERY = 120000   // sin cuenta se pregunta menos a menudo
let running = false
let lastPublic = 0

// Descarga la playlist por la mejor vía disponible
async function fetchAny(id) {
  if (isConnected()) {
    try { return { ...(await fetchPlaylist(id)), via: 'api' } } catch { /* p. ej. playlist editorial: se prueba la vía pública */ }
  }
  return { ...(await fetchPublic(id)), via: 'public' }
}

export async function importPlaylist(text) {
  const id = parsePlaylistId(text)
  if (!id) throw new Error('Pega el enlace de una playlist de Spotify')
  const pl = await fetchAny(id)
  if (!pl.items.length) throw new Error('La playlist está vacía o es privada')
  useLib.getState().upsertSpotify(pl)
  return pl
}

function apply(old, pl) {
  const before = new Set(old.items.map((i) => i.sid)), after = new Set(pl.items.map((i) => i.sid))
  const added = pl.items.filter((i) => !before.has(i.sid)).length
  const removed = old.items.filter((i) => !after.has(i.sid)).length
  useLib.getState().upsertSpotify(pl)
  const parts = [added && `+${added}`, removed && `−${removed}`].filter(Boolean).join(' / ')
  if (parts || old.name !== pl.name) toast(`«${pl.name}» se ha actualizado desde Spotify${parts ? ` (${parts})` : ''}`)
}

// Comprueba todas las playlists sincronizadas. force = recargar ahora
export async function checkAll(force = false) {
  const lists = useLib.getState().lib.spotify
  if (running || !lists.length) return
  const connected = isConnected()
  const publicDue = force || Date.now() - lastPublic >= PUBLIC_EVERY
  running = true
  useUI.getState().setSync({ checking: true, error: '' })
  let error = ''
  for (const old of lists) {
    try {
      if (connected && old.via === 'api') {
        if (force || (await snapshotOf(old.id)) !== old.snapshot) apply(old, await fetchAny(old.id))
      } else if (publicDue) {
        const pl = await fetchAny(old.id)
        if (force || pl.snapshot !== old.snapshot) apply(old, pl)
      }
    } catch (e) { error = e.message }
  }
  if (publicDue) lastPublic = Date.now()
  running = false
  useUI.getState().setSync({ checking: false, last: Date.now(), error })
}

export function startSync() {
  const tick = () => { if (!document.hidden && useLib.getState().ready) checkAll() }
  const timer = setInterval(tick, INTERVAL)
  document.addEventListener('visibilitychange', tick)
  window.addEventListener('online', tick)
  setTimeout(tick, 1500)
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('online', tick) }
}
