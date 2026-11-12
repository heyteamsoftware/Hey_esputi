// Un "contexto" es cualquier cosa reproducible como lista: playlist propia,
// favoritos, playlist de Audius, género, álbum de Archive o playlist de Spotify.
import { audius } from './sources/audius'
import { archive } from './sources/archive'
import { spTrack } from './spotify'
import { useLib } from '../store/library'
import { usePlayer } from '../store/player'
import { toast } from '../store/ui'

export const LOCAL_TYPES = ['liked', 'own', 'spotify']

export function localContext(lib, session, type, id) {
  if (type === 'liked') return { type, id: '', name: 'Canciones que te gustan', kind: 'Playlist', owner: session?.name || '', tracks: lib.liked }
  if (type === 'own') {
    const p = lib.playlists.find((x) => x.id === id)
    return p && { type, id, name: p.name, kind: 'Playlist', owner: session?.name || '', tracks: p.tracks }
  }
  if (type === 'spotify') {
    const p = lib.spotify.find((x) => x.id === id)
    return p && {
      type, id, name: p.name, kind: 'Playlist de Spotify', owner: p.owner, cover: p.image, description: p.description,
      tracks: p.items.map(spTrack), syncedAt: p.syncedAt,
    }
  }
  return null
}

export async function remoteContext(type, id) {
  if (type === 'audius') return { kind: 'Playlist', ...(await audius.playlist(id)) }
  if (type === 'archive') return { kind: 'Álbum', ...(await archive.album(id)) }
  if (type === 'genre') {
    return {
      type, id, kind: 'Género', name: id || 'Tendencias', owner: 'Audius', description: 'Lo más escuchado esta semana',
      tracks: await audius.trending(id || undefined, 50),
    }
  }
  throw new Error('Lista desconocida')
}

export const ctxRef = (c) => ({ type: c.type, id: c.id, name: c.name, cover: c.cover || c.tracks?.[0]?.cover || '' })

// Reproduce directamente una tarjeta (playlist, álbum…) sin entrar en ella
export async function playContext(item) {
  try {
    const { lib, session } = useLib.getState()
    const c = LOCAL_TYPES.includes(item.type) ? localContext(lib, session, item.type, item.id) : await remoteContext(item.type, item.id)
    if (!c?.tracks?.length) return toast('Esta lista está vacía')
    usePlayer.getState().playList(c.tracks, 0, ctxRef(c))
  } catch { toast('No se pudo cargar la lista') }
}
