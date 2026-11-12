// Biblioteca del usuario: favoritos, playlists propias, playlists de Spotify
// sincronizadas y playlists guardadas. Solo texto; se guarda en el navegador
// y se sube al servidor para recuperarla desde cualquier equipo.
import { create } from 'zustand'
import { api } from '../lib/api'
import { store, uid } from '../lib/util'
import { toast } from './ui'

const empty = () => ({ liked: [], playlists: [], spotify: [], saved: [], prefs: null, updatedAt: 0 })
const fix = (l) => ({ ...empty(), ...(l || {}) })
const libKey = (name) => 'esputi.lib.' + name.toLowerCase()
const recKey = (name) => 'esputi.recents.' + name.toLowerCase()
const seaKey = (name) => 'esputi.searches.' + name.toLowerCase()

// Solo se guardan los campos de texto necesarios de cada pista
export const slim = (t) => {
  const o = { id: t.id, source: t.source, sid: t.sid, title: t.title, artist: t.artist, duration: t.duration || 0, cover: t.cover || '' }
  if (t.artistId) o.artistId = t.artistId
  if (t.album) o.album = t.album
  if (t.albumId) o.albumId = t.albumId
  if (t.q) o.q = t.q
  if (t.genre) o.genre = t.genre
  return o
}

let pushTimer

export const useLib = create((set, get) => {
  const pushNow = async () => {
    const { session, lib } = get()
    if (!session) return
    try { await api.setLib(session, lib) } catch (e) {
      if (e.status === 401) get().logout(true)
      else if (e.status === 413) toast('Tu biblioteca es demasiado grande para guardarse en el servidor')
    }
  }
  const mutate = (fn) => {
    const { session } = get()
    const lib = { ...fn(get().lib), updatedAt: Date.now() }
    set({ lib })
    if (!session) return
    store.set(libKey(session.name), lib)
    clearTimeout(pushTimer)
    pushTimer = setTimeout(pushNow, 1200)
  }

  return {
    session: store.get('esputi.session'),
    ready: false,
    lib: empty(),
    recents: [],
    searches: [], // búsquedas desde las que se ha reproducido algo (para la portada personalizada)

    async enter(session) {
      store.set('esputi.session', session)
      const local = fix(store.get(libKey(session.name)))
      set({ session, lib: local, recents: store.get(recKey(session.name), []), searches: store.get(seaKey(session.name), []), ready: false })
      try {
        const r = await api.getLib(session)
        const remote = r.library ? fix(r.library) : null
        if (remote && remote.updatedAt >= local.updatedAt) { set({ lib: remote }); store.set(libKey(session.name), remote) }
        else if (local.updatedAt) pushNow()
      } catch (e) {
        if (e.status === 401) { get().logout(true); return }
        toast('Sin conexión con el servidor: se usa la copia de este equipo')
      }
      set({ ready: true })
    },
    // Vuelve a pedir la biblioteca al servidor por si se ha cambiado desde otro equipo
    async refresh() {
      const { session, lib } = get()
      if (!session) return false
      let r
      try { r = await api.getLib(session) } catch (e) { if (e.status === 401) get().logout(true); throw e }
      const remote = r.library ? fix(r.library) : null
      if (!remote || remote.updatedAt <= lib.updatedAt) return false
      set({ lib: remote }); store.set(libKey(session.name), remote)
      return true
    },
    logout(expired) {
      const { session } = get()
      if (session && !expired) api.logout(session).catch(() => {})
      store.del('esputi.session')
      set({ session: null, lib: empty(), recents: [], searches: [], ready: false })
      if (expired) toast('Tu sesión ha caducado, vuelve a entrar')
    },

    // Encuesta de gustos: estilos preferidos y estilos que no se muestran
    setPrefs(likes, dislikes) { mutate((l) => ({ ...l, prefs: { likes: likes.slice(0, 5), dislikes: dislikes.slice(0, 5) } })) },

    toggleLike(t) {
      const liked = get().lib.liked.some((x) => x.id === t.id)
      mutate((l) => ({ ...l, liked: liked ? l.liked.filter((x) => x.id !== t.id) : [slim(t), ...l.liked] }))
      toast(liked ? 'Quitada de Canciones que te gustan' : 'Añadida a Canciones que te gustan')
    },
    createPlaylist(name, tracks = []) {
      const n = get().lib.playlists.length + 1
      const p = { id: uid(), name: (name || `Mi playlist n.º ${n}`).slice(0, 80), description: '', tracks: tracks.map(slim), created: Date.now() }
      mutate((l) => ({ ...l, playlists: [p, ...l.playlists] }))
      return p
    },
    renamePlaylist(id, name) {
      mutate((l) => ({ ...l, playlists: l.playlists.map((p) => (p.id === id ? { ...p, name: name.slice(0, 80) } : p)) }))
    },
    deletePlaylist(id) {
      mutate((l) => ({ ...l, playlists: l.playlists.filter((p) => p.id !== id) }))
    },
    addToPlaylist(id, t) {
      const p = get().lib.playlists.find((x) => x.id === id)
      if (!p) return
      if (p.tracks.some((x) => x.id === t.id)) return toast('Ya estaba en ' + p.name)
      mutate((l) => ({ ...l, playlists: l.playlists.map((x) => (x.id === id ? { ...x, tracks: [...x.tracks, slim(t)] } : x)) }))
      toast('Añadida a ' + p.name)
    },
    removeFromPlaylist(id, trackId) {
      mutate((l) => ({ ...l, playlists: l.playlists.map((x) => (x.id === id ? { ...x, tracks: x.tracks.filter((t) => t.id !== trackId) } : x)) }))
    },
    upsertSpotify(pl) {
      mutate((l) => ({ ...l, spotify: l.spotify.some((x) => x.id === pl.id) ? l.spotify.map((x) => (x.id === pl.id ? pl : x)) : [pl, ...l.spotify] }))
    },
    removeSpotify(id) {
      mutate((l) => ({ ...l, spotify: l.spotify.filter((x) => x.id !== id) }))
    },
    toggleSaved(item) {
      const has = get().lib.saved.some((x) => x.type === item.type && x.id === item.id)
      mutate((l) => ({
        ...l,
        saved: has ? l.saved.filter((x) => !(x.type === item.type && x.id === item.id))
          : [{ type: item.type, id: item.id, name: item.name, cover: item.cover || '', owner: item.owner || '' }, ...l.saved],
      }))
      toast(has ? 'Quitada de Tu biblioteca' : 'Guardada en Tu biblioteca')
    },
    // Últimos sitios desde los que se ha reproducido (solo en este navegador)
    pushRecent(ctx) {
      const { session, recents } = get()
      if (!session || !ctx?.type) return
      if (ctx.type === 'search') {
        const q = String(ctx.id || '').trim().toLowerCase()
        if (q.length < 3) return
        const searches = [q, ...get().searches.filter((x) => x !== q)].slice(0, 12)
        set({ searches }); store.set(seaKey(session.name), searches)
        return
      }
      if (ctx.type === 'foryou') return
      const next = [ctx, ...recents.filter((r) => !(r.type === ctx.type && r.id === ctx.id))].slice(0, 8)
      set({ recents: next })
      store.set(recKey(session.name), next)
    },
  }
})
