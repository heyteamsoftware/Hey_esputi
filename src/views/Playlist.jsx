// Vista de lista: favoritos, playlist propia, de Audius, género, álbum de Archive o playlist de Spotify.
import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { Cover, Empty, LikedCover, PlayFab, Spinner } from '../components/Common'
import TrackList from '../components/TrackList'
import { useAsync } from './Browse'
import { ctxRef, localContext, LOCAL_TYPES, remoteContext } from '../lib/contexts'
import { cachedMatch, clearMisses, matchTrack } from '../lib/matcher'
import { checkAll } from '../lib/sync'
import { ago, cx, fmtTotal, hueOf, pool } from '../lib/util'
import { nav, plPath, toast, useUI } from '../store/ui'
import { useLib } from '../store/library'
import { usePlayer } from '../store/player'

// Empareja en segundo plano las canciones de Spotify con las fuentes abiertas
function useMatching(enabled, tracks, round) {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const todo = tracks.filter((t) => cachedMatch(t.q) === undefined)
    pool(todo, 3, async (t) => {
      if (!alive) return
      await matchTrack(t.q)
      if (alive) bump((n) => n + 1)
    })
    return () => { alive = false }
  }, [enabled, tracks, round])
}

export default function Playlist({ type, id }) {
  const lib = useLib((s) => s.lib)
  const session = useLib((s) => s.session)
  const L = useLib.getState()
  const isLocal = LOCAL_TYPES.includes(type)
  const local = useMemo(() => (isLocal ? localContext(lib, session, type, id) : null), [isLocal, lib, session, type, id])
  const remote = useAsync(() => (isLocal ? Promise.resolve(null) : remoteContext(type, id)), [type, id])
  const c = isLocal ? local : remote.data

  const playList = usePlayer((s) => s.playList)
  const toggle = usePlayer((s) => s.toggle)
  const playing = usePlayer((s) => s.isPlaying)
  const active = usePlayer((s) => s.context?.type === type && String(s.context?.id ?? '') === String(id ?? ''))
  const openMenu = useUI((s) => s.openMenu)
  const syncing = useUI((s) => s.sync.checking)
  const [editing, setEditing] = useState(false)

  const isSpotify = type === 'spotify'
  const [round, setRound] = useState(0)
  useMatching(isSpotify && !!c, c?.tracks || [], round)
  // «Sincronizar ahora»: relee la playlist y vuelve a buscar las canciones que faltaban
  const resync = () => { clearMisses(); setRound((r) => r + 1); checkAll(true); toast('Sincronizando y buscando de nuevo las canciones que faltan…') }

  if (!isLocal && remote.loading) return <div className="view"><Spinner /></div>
  if (!c) {
    return (
      <div className="view">
        <Empty icon="alert" title="No encontramos esta lista">Puede que se haya eliminado. <a href="#/">Volver al inicio</a></Empty>
      </div>
    )
  }

  // En playlists de Spotify sin portadas se muestra la de la canción emparejada
  const tracks = isSpotify ? c.tracks.map((t) => (t.cover ? t : { ...t, cover: cachedMatch(t.q)?.cover || '' })) : c.tracks
  const total = tracks.reduce((a, t) => a + (t.duration || 0), 0)
  const saved = lib.saved.some((x) => x.type === type && x.id === id)
  const canSave = type === 'audius' || type === 'archive' || type === 'album' || type === 'legend'
  const found = isSpotify ? tracks.filter((t) => cachedMatch(t.q)).length : 0
  const pendingMatch = isSpotify ? tracks.filter((t) => cachedMatch(t.q) === undefined).length : 0
  const cover = c.cover || tracks[0]?.cover

  const play = () => (active ? toggle() : tracks.length && playList(tracks, 0, ctxRef({ ...c, cover })))
  const shufflePlay = () => { if (!tracks.length) return; usePlayer.setState({ shuffle: true }); playList(tracks, Math.floor(Math.random() * tracks.length), ctxRef({ ...c, cover })) }

  const menu = [
    { label: 'Añadir todo a la cola', onClick: () => { const P = usePlayer.getState(); if (P.queue.length) { usePlayer.setState({ queue: [...P.queue, ...tracks] }); toast('Lista añadida a la cola') } else play() } },
    type !== 'own' && tracks.length > 0 && { label: 'Copiar a una playlist mía', onClick: () => { const p = L.createPlaylist(c.name, tracks); nav('pl/own/' + p.id) } },
    type === 'own' && { label: 'Cambiar nombre', onClick: () => setEditing(true) },
    type === 'own' && { label: 'Eliminar playlist', danger: true, onClick: () => { if (confirm(`¿Eliminar «${c.name}»?`)) { L.deletePlaylist(id); nav('') } } },
    isSpotify && { label: 'Dejar de sincronizar', danger: true, onClick: () => { if (confirm(`¿Quitar «${c.name}» de Esputi? No se borra de Spotify.`)) { L.removeSpotify(id); nav('sync') } } },
  ]

  return (
    <div className="view pl">
      <div className="pl-head" style={{ '--h': type === 'liked' ? 255 : hueOf(c.name) }}>
        {type === 'liked' ? <LikedCover className="pl-cover" /> : <Cover src={cover} covers={c.covers} alt={`Portada de ${c.name}`} seed={c.name} className="pl-cover" />}
        <div className="pl-info">
          <span className="pl-kind">{c.kind}</span>
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.target).get('name').trim(); if (v) L.renamePlaylist(id, v); setEditing(false) }}>
              <input name="name" className="input title-input" defaultValue={c.name} maxLength={80} autoFocus onBlur={() => setEditing(false)} aria-label="Nombre de la playlist" />
            </form>
          ) : (
            <h1 className={cx(c.name.length > 28 && 'long')} onClick={() => type === 'own' && setEditing(true)} title={type === 'own' ? 'Cambiar nombre' : undefined}>{c.name}</h1>
          )}
          {c.description && <p className="pl-desc">{c.description}</p>}
          <p className="pl-meta">
            {c.owner && <><strong>{c.ownerId ? <a href={'#/' + plPath('artist', c.ownerId)}>{c.owner}</a> : c.owner}</strong> • </>}{tracks.length} {tracks.length === 1 ? 'canción' : 'canciones'}{total > 0 && `, ${fmtTotal(total)}`}
          </p>
          {isSpotify && (
            <p className="pl-sync">
              <span className="dot ok" />
              {`Sincronizada en vivo • actualizada ${ago(c.syncedAt)}`}
              {' • '}{pendingMatch ? `emparejando… ${found}/${tracks.length}` : `${found}/${tracks.length} disponibles`}
            </p>
          )}
        </div>
      </div>

      <div className="pl-actions">
        <PlayFab playing={active && playing} onClick={play} />
        <button className="icon-btn big" onClick={shufflePlay} aria-label="Reproducir en aleatorio"><Icon name="shuffle" size={26} /></button>
        {canSave && (
          <button className={cx('icon-btn big like', saved && 'on')} onClick={() => L.toggleSaved({ ...c, cover })}
            aria-label={saved ? 'Quitar de Tu biblioteca' : 'Guardar en Tu biblioteca'} aria-pressed={saved}>
            <Icon name={saved ? 'heartFill' : 'heart'} size={26} />
          </button>
        )}
        {isSpotify && (
          <button className="icon-btn big" onClick={resync} aria-label="Sincronizar ahora" title="Sincronizar ahora">
            <Icon name="sync" size={24} className={syncing ? 'spin' : ''} />
          </button>
        )}
        <button className="icon-btn big" onClick={(e) => openMenu(e, menu)} aria-label={`Más opciones para ${c.name}`}><Icon name="dots" size={26} /></button>
      </div>

      {tracks.length ? (
        <TrackList tracks={tracks} context={ctxRef({ ...c, cover })} showAlbum={type !== 'album' && tracks.some((t) => t.album)}
          statusOf={isSpotify ? (t) => cachedMatch(t.q) : undefined}
          onRemove={type === 'own' ? (t) => L.removeFromPlaylist(id, t.id) : undefined} />
      ) : (
        <Empty title={type === 'liked' ? 'Las canciones que te gusten aparecerán aquí' : 'Esta lista está vacía'}>
          Pulsa el corazón de una canción o usa su menú para añadirla. <a href="#/search/">Buscar música</a>
        </Empty>
      )}
    </div>
  )
}
