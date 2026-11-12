import { useMemo } from 'react'
import Icon from './Icon'
import { Cover } from './Common'
import { cx, fmtTime } from '../lib/util'
import { usePlayer } from '../store/player'
import { useLib } from '../store/library'
import { nav, plPath, useUI } from '../store/ui'

// Menú contextual de una canción
export function trackMenu(t, { onRemove } = {}) {
  const P = usePlayer.getState(), L = useLib.getState()
  const liked = L.lib.liked.some((x) => x.id === t.id)
  return [
    { label: 'Añadir a la cola', onClick: () => P.addToQueue(t) },
    { label: 'Reproducir a continuación', onClick: () => P.playNext(t) },
    { sep: true },
    { label: liked ? 'Quitar de Canciones que te gustan' : 'Guardar en Canciones que te gustan', onClick: () => L.toggleLike(t) },
    ...L.lib.playlists.slice(0, 12).map((p) => ({ label: `Añadir a «${p.name}»`, onClick: () => L.addToPlaylist(p.id, t) })),
    { label: 'Añadir a una playlist nueva', onClick: () => { const p = L.createPlaylist(t.title, [t]); nav(plPath('own', p.id)) } },
    (t.artistId || t.albumId) && { sep: true },
    t.artistId && { label: 'Ir al artista', onClick: () => nav('artist/' + t.artistId) },
    t.albumId && { label: 'Ir al álbum', onClick: () => nav(plPath('archive', t.albumId)) },
    onRemove && { sep: true },
    onRemove && { label: 'Quitar de esta playlist', danger: true, onClick: () => onRemove(t) },
  ]
}

const touch = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches

function Row({ t, i, active, playing, liked, showAlbum, status, onPlay, onRemove }) {
  const toggle = usePlayer((s) => s.toggle)
  const toggleLike = useLib((s) => s.toggleLike)
  const openMenu = useUI((s) => s.openMenu)
  const act = () => (active ? toggle() : onPlay(i))
  const missing = status === null
  return (
    <div className={cx('row', active && 'active', missing && 'missing')} onDoubleClick={act} onClick={touch ? act : undefined}
      onContextMenu={(e) => openMenu(e, trackMenu(t, { onRemove }))}>
      <div className="row-num">
        <span className="num">{active && playing ? <span className="eq" aria-label="Sonando"><i /><i /><i /></span> : i + 1}</span>
        <button className="row-play" onClick={(e) => { e.stopPropagation(); act() }} aria-label={active && playing ? `Pausar ${t.title}` : `Reproducir ${t.title}`}>
          <Icon name={active && playing ? 'pause' : 'play'} size={16} />
        </button>
      </div>
      <div className="row-main">
        <Cover src={t.cover} alt="" seed={t.title} className="row-cover" />
        <div className="row-text">
          <div className="row-title">{t.title}</div>
          <div className="row-artist">
            {missing && <span className="tag warn">No encontrada</span>}
            {t.artistId
              ? <a href={'#/artist/' + t.artistId} onClick={(e) => e.stopPropagation()}>{t.artist}</a>
              : t.artist}
          </div>
        </div>
      </div>
      {showAlbum && <div className="row-album">{t.album || ''}</div>}
      <div className="row-end">
        <button className={cx('icon-btn like', liked && 'on')} onClick={(e) => { e.stopPropagation(); toggleLike(t) }}
          aria-label={liked ? 'Quitar de favoritos' : 'Guardar en favoritos'} aria-pressed={liked}>
          <Icon name={liked ? 'heartFill' : 'heart'} size={16} />
        </button>
        <span className="row-time">{t.duration ? fmtTime(t.duration) : '–:––'}</span>
        <button className="icon-btn more" onClick={(e) => openMenu(e, trackMenu(t, { onRemove }))} aria-label={`Más opciones para ${t.title}`}>
          <Icon name="dots" size={18} />
        </button>
      </div>
    </div>
  )
}

export default function TrackList({ tracks, context, showAlbum, onRemove, statusOf, header = true }) {
  const currentId = usePlayer((s) => s.current?.id)
  const playing = usePlayer((s) => s.isPlaying)
  const playList = usePlayer((s) => s.playList)
  const likedList = useLib((s) => s.lib.liked)
  const liked = useMemo(() => new Set(likedList.map((t) => t.id)), [likedList])
  const onPlay = (i) => playList(tracks, i, context)
  return (
    <div className={cx('tracks', showAlbum && 'with-album')}>
      {header && (
        <div className="row head">
          <div className="row-num">#</div>
          <div>Título</div>
          {showAlbum && <div className="row-album">Álbum</div>}
          <div className="row-end"><Icon name="clock" size={16} /></div>
        </div>
      )}
      {tracks.map((t, i) => (
        <Row key={t.id + ':' + i} t={t} i={i} active={t.id === currentId} playing={playing} liked={liked.has(t.id)}
          showAlbum={showAlbum} status={statusOf ? statusOf(t) : undefined} onPlay={onPlay} onRemove={onRemove} />
      ))}
    </div>
  )
}
