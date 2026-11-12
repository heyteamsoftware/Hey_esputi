import { useState } from 'react'
import Icon from './Icon'
import { cx, hueOf } from '../lib/util'
import { nav, plPath } from '../store/ui'
import { usePlayer } from '../store/player'
import { playContext } from '../lib/contexts'

// Portada con respaldo: si no hay imagen (o falla) se dibuja un degradado
export function Cover({ src, alt, className, round, icon = 'music', seed }) {
  const [bad, setBad] = useState(false)
  if (!src || bad) {
    const h = hueOf(seed || alt || '')
    return (
      <div className={cx('cover cover-empty', round && 'round', className)} role="img" aria-label={alt}
        style={{ background: `linear-gradient(135deg, hsl(${h} 55% 38%), hsl(${(h + 60) % 360} 50% 22%))` }}>
        <Icon name={icon} size={28} />
      </div>
    )
  }
  return <img className={cx('cover', round && 'round', className)} src={src} alt={alt} loading="lazy" onError={() => setBad(true)} />
}

export function LikedCover({ className }) {
  return (
    <div className={cx('cover cover-liked', className)} role="img" aria-label="Canciones que te gustan">
      <Icon name="heartFill" size={24} />
    </div>
  )
}

export function Spinner() { return <div className="spinner" role="status" aria-label="Cargando" /> }

export function Empty({ icon = 'music', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={44} />
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  )
}

export function PlayFab({ playing, onClick, small, label }) {
  return (
    <button className={cx('fab', small && 'small')} onClick={onClick} aria-label={label || (playing ? 'Pausar' : 'Reproducir')}>
      <Icon name={playing ? 'pause' : 'play'} size={small ? 18 : 24} />
    </button>
  )
}

// Tarjeta de playlist / álbum / género
export function ContextCard({ item }) {
  const active = usePlayer((s) => s.context?.type === item.type && s.context?.id === item.id)
  const playing = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  const go = () => nav(plPath(item.type, item.id))
  return (
    <div className="card" role="link" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()}>
      <div className="card-img">
        <Cover src={item.cover} alt={`Portada de ${item.name}`} seed={item.name} />
        <div className={cx('card-play', active && playing && 'show')}>
          <PlayFab small playing={active && playing} label={`Reproducir ${item.name}`}
            onClick={(e) => { e.stopPropagation(); active ? toggle() : playContext(item) }} />
        </div>
      </div>
      <div className="card-title">{item.name}</div>
      <div className="card-sub">{item.owner}</div>
    </div>
  )
}

// Tarjeta de canción: reproduce la lista a la que pertenece desde esa pista
export function TrackCard({ track, onPlay }) {
  const active = usePlayer((s) => s.current?.id === track.id)
  const playing = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  const act = () => (active ? toggle() : onPlay())
  return (
    <div className="card" role="button" tabIndex={0} onClick={act} onKeyDown={(e) => e.key === 'Enter' && act()}>
      <div className="card-img">
        <Cover src={track.cover} alt={`Portada de ${track.title}`} seed={track.title} />
        <div className={cx('card-play', active && playing && 'show')}>
          <PlayFab small playing={active && playing} label={`Reproducir ${track.title}`} onClick={(e) => { e.stopPropagation(); act() }} />
        </div>
      </div>
      <div className={cx('card-title', active && 'green')}>{track.title}</div>
      <div className="card-sub">{track.artist}</div>
    </div>
  )
}

export function ArtistCard({ artist }) {
  const go = () => nav('artist/' + artist.id)
  return (
    <div className="card" role="link" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()}>
      <div className="card-img"><Cover round src={artist.cover} alt={`Foto de ${artist.name}`} seed={artist.name} /></div>
      <div className="card-title">{artist.name}</div>
      <div className="card-sub">Artista</div>
    </div>
  )
}

export function Section({ title, children, more }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {more && <button className="link" onClick={more.onClick}>{more.label}</button>}
      </div>
      {children}
    </section>
  )
}

export const SOURCE_LABEL = { audius: 'Audius', archive: 'Internet Archive', youtube: 'YouTube', pending: 'Spotify' }
