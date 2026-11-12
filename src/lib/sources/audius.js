// Audius: red abierta de música con API pública y sin clave. https://docs.audius.org
const APP = 'ESPUTI'
const HOST = 'https://api.audius.co'

async function get(path, params = {}) {
  const u = new URL(HOST + '/v1' + path)
  Object.entries({ ...params, app_name: APP }).forEach(([k, v]) => v != null && v !== '' && u.searchParams.set(k, v))
  const r = await fetch(u)
  if (!r.ok) throw new Error('Audius ' + r.status)
  return (await r.json()).data || []
}

const art = (a) => a?.['480x480'] || a?.['150x150'] || a?.['1000x1000'] || ''

export const mapTrack = (t) => ({
  id: 'audius:' + t.id,
  source: 'audius',
  sid: t.id,
  title: (t.title || '').trim(),
  artist: t.user?.name || 'Desconocido',
  artistId: t.user?.id,
  duration: t.duration || 0,
  cover: art(t.artwork),
  genre: t.genre || '',
  plays: t.play_count || 0,
})

const mapPlaylist = (p) => ({
  type: 'audius', id: p.id, name: p.playlist_name, cover: art(p.artwork),
  owner: p.user?.name || '', description: p.description || '', count: p.track_count, isAlbum: !!p.is_album,
})

const mapUser = (u) => ({
  id: u.id, name: u.name, handle: u.handle, cover: art(u.profile_picture),
  followers: u.follower_count, tracks: u.track_count, bio: u.bio || '', verified: u.is_verified,
})

const playable = (t) => t && t.is_streamable !== false && !t.is_stream_gated && !t.is_delete

export const streamUrl = (sid) => `${HOST}/v1/tracks/${sid}/stream?app_name=${APP}`

export const GENRES = ['Electronic', 'Hip-Hop/Rap', 'Rock', 'Pop', 'Lo-Fi', 'House', 'Latin', 'Jazz', 'Ambient', 'R&B/Soul',
  'Alternative', 'Techno', 'Dubstep', 'Drum & Bass', 'Metal', 'Reggae', 'Classical', 'Folk', 'Funk', 'Punk']

export const audius = {
  trending: async (genre, limit = 30) => (await get('/tracks/trending', { genre, time: 'week', limit })).filter(playable).map(mapTrack),
  searchTracks: async (query, limit = 25) => (await get('/tracks/search', { query, limit })).filter(playable).map(mapTrack),
  searchPlaylists: async (query, limit = 12) => (await get('/playlists/search', { query, limit })).map(mapPlaylist),
  searchUsers: async (query, limit = 8) => (await get('/users/search', { query, limit })).map(mapUser),
  trendingPlaylists: async (limit = 12) => (await get('/playlists/trending', { time: 'week', limit })).map(mapPlaylist),
  playlist: async (id) => {
    const [meta, tracks] = await Promise.all([get(`/playlists/${id}`), get(`/playlists/${id}/tracks`)])
    return { ...mapPlaylist(meta[0] || { id }), tracks: tracks.filter(playable).map(mapTrack) }
  },
  user: async (id) => mapUser(await get(`/users/${id}`)),
  userTracks: async (id, limit = 50) => (await get(`/users/${id}/tracks`, { limit, sort: 'plays' })).filter(playable).map(mapTrack),
}
