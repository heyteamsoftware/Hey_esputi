// Barra de reproducción inferior, panel derecho con la cola y, en el móvil,
// la pantalla completa "Reproduciendo" que se abre al tocar la barra.
import { Fragment, useEffect, useState } from 'react'
import Icon from './Icon'
import { Cover } from './Common'
import { cx, fmtTime } from '../lib/util'
import { usePlayer } from '../store/player'
import { useLib } from '../store/library'
import { useUI } from '../store/ui'
import { artistHref, trackMenu } from './TrackList'

const isSmall = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 1100px)').matches

function Slider({ value, max, onChange, onCommit, label }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <input type="range" className="slider" min={0} max={max || 1} step="any" value={Math.min(value, max || 1)} aria-label={label}
      style={{ '--p': pct + '%' }} onChange={(e) => onChange(+e.target.value)}
      onPointerUp={onCommit} onKeyUp={onCommit} onTouchEnd={onCommit} />
  )
}

function Progress() {
  const time = usePlayer((s) => s.time)
  const duration = usePlayer((s) => s.duration)
  const seek = usePlayer((s) => s.seek)
  const loading = usePlayer((s) => s.loading && s.isPlaying)
  const [drag, setDrag] = useState(null)
  const shown = drag ?? time
  return (
    <div className={cx('progress', loading && 'loading')}>
      <span>{fmtTime(shown)}</span>
      <Slider value={shown} max={duration} label="Progreso de la canción" onChange={setDrag}
        onCommit={() => { if (drag != null) { seek(drag); setDrag(null) } }} />
      <span>{fmtTime(duration)}</span>
    </div>
  )
}

export function PlayerBar() {
  const t = usePlayer((s) => s.current)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const loading = usePlayer((s) => s.loading)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const volume = usePlayer((s) => s.volume)
  const muted = usePlayer((s) => s.muted)
  const P = usePlayer.getState()
  const liked = useLib((s) => !!t && s.lib.liked.some((x) => x.id === t.id))
  const toggleLike = useLib((s) => s.toggleLike)
  const panel = useUI((s) => s.panel)
  const togglePanel = useUI((s) => s.togglePanel)
  const openMenu = useUI((s) => s.openMenu)
  const setNp = useUI((s) => s.setNp)

  return (
    <footer className="player" aria-label="Reproductor">
      <div className="player-left" onClick={(e) => { if (t && isSmall() && !e.target.closest('button, a')) setNp(true) }}>
        {t ? (
          <>
            <Cover src={t.cover} alt={`Portada de ${t.title}`} seed={t.title} className="player-cover" />
            <div className="player-text" onContextMenu={(e) => openMenu(e, trackMenu(t))}>
              <div className="player-title">{t.title}</div>
              <div className="player-artist">
                <a href={artistHref(t)}>{t.artist}</a>
              </div>
            </div>
            <button className={cx('icon-btn like', liked && 'on')} onClick={() => toggleLike(t)}
              aria-label={liked ? 'Quitar de favoritos' : 'Guardar en favoritos'} aria-pressed={liked}>
              <Icon name={liked ? 'heartFill' : 'heart'} size={18} />
            </button>
          </>
        ) : <div className="muted player-idle">Elige una canción para empezar</div>}
      </div>

      <div className="player-mid">
        <div className="controls">
          <button className={cx('icon-btn hide-m', shuffle && 'on')} onClick={P.toggleShuffle} aria-label="Aleatorio" aria-pressed={shuffle}><Icon name="shuffle" size={18} /></button>
          <button className="icon-btn hide-m" onClick={P.prev} disabled={!t} aria-label="Anterior"><Icon name="prev" /></button>
          <button className={cx('play-btn', loading && isPlaying && 'loading')} onClick={P.toggle} disabled={!t} aria-label={isPlaying ? 'Pausar' : 'Reproducir'}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
          </button>
          <button className="icon-btn" onClick={() => P.next()} disabled={!t} aria-label="Siguiente"><Icon name="next" /></button>
          <button className={cx('icon-btn hide-m', repeat !== 'off' && 'on')} onClick={P.cycleRepeat}
            aria-label={repeat === 'one' ? 'Repetir canción' : repeat === 'all' ? 'Repetir todo' : 'Repetir desactivado'}>
            <Icon name="repeat" size={18} />{repeat === 'one' && <b className="one">1</b>}
          </button>
        </div>
        <Progress />
      </div>

      <div className="player-right hide-m">
        <button className={cx('icon-btn', panel && 'on')} onClick={togglePanel} aria-label="Cola de reproducción" aria-pressed={panel}><Icon name="queue" size={18} /></button>
        <button className="icon-btn" onClick={P.toggleMute} aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
          <Icon name={muted || volume === 0 ? 'mute' : 'volume'} size={18} />
        </button>
        <div className="vol"><Slider value={muted ? 0 : volume} max={1} label="Volumen" onChange={P.setVolume} /></div>
      </div>
    </footer>
  )
}

export function QueuePanel() {
  const t = usePlayer((s) => s.current)
  const ctx = usePlayer((s) => s.context)
  const togglePanel = useUI((s) => s.togglePanel)

  return (
    <aside className="panel" aria-label="Cola de reproducción">
      <div className="panel-head">
        <strong>{ctx?.name || 'Cola'}</strong>
        <button className="icon-btn" onClick={togglePanel} aria-label="Cerrar la cola"><Icon name="x" size={18} /></button>
      </div>
      <div className="panel-body">
        {t ? (
          <>
            <Cover src={t.cover} alt={`Portada de ${t.title}`} seed={t.title} className="panel-cover" />
            <div className="panel-title">{t.title}</div>
            <div className="panel-artist">{t.artist}</div>
            <UpNext />
          </>
        ) : <p className="muted small">Tu cola está vacía. Reproduce algo y aparecerá aquí.</p>}
      </div>
    </aside>
  )
}

// Lo que suena después
function UpNext() {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const jump = usePlayer((s) => s.jump)
  const removeAt = usePlayer((s) => s.removeAt)
  const autoFrom = usePlayer((s) => s.autoFrom)
  const upcoming = queue.map((q, i) => [q, i]).slice(index + 1, index + 51)
  return (
    <>
      <h3>A continuación</h3>
      {upcoming.length === 0 && <p className="muted small">No hay más canciones en la cola.</p>}
      {upcoming.map(([q, i]) => (
        <Fragment key={q.id + i}>
        {i === Math.max(autoFrom ?? -1, index + 1) && autoFrom != null && <p className="q-auto"><Icon name="sync" size={13} /> Música infinita: más de lo que te gusta</p>}
        <div className="q-item" onDoubleClick={() => jump(i)}>
          <button className="q-play" onClick={() => jump(i)} aria-label={`Reproducir ${q.title}`}>
            <Cover src={q.cover} alt="" seed={q.title} />
          </button>
          <div className="lib-text">
            <div className="lib-title">{q.title}</div>
            <div className="lib-sub">{q.artist}</div>
          </div>
          <button className="icon-btn more" onClick={() => removeAt(i)} aria-label={`Quitar ${q.title} de la cola`}><Icon name="x" size={16} /></button>
        </div>
        </Fragment>
      ))}
    </>
  )
}

// Móvil: pantalla completa con portada, progreso y todos los mandos
export function NowPlaying() {
  const open = useUI((s) => s.np)
  const setNp = useUI((s) => s.setNp)
  const openMenu = useUI((s) => s.openMenu)
  const t = usePlayer((s) => s.current)
  const ctx = usePlayer((s) => s.context)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const loading = usePlayer((s) => s.loading)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const liked = useLib((s) => !!t && s.lib.liked.some((x) => x.id === t.id))
  const toggleLike = useLib((s) => s.toggleLike)
  const [queue, setQueue] = useState(false)
  const P = usePlayer.getState()

  // Al navegar (ir al artista, al álbum…) se cierra sola
  useEffect(() => {
    const close = () => setNp(false)
    window.addEventListener('hashchange', close)
    return () => window.removeEventListener('hashchange', close)
  }, [setNp])

  if (!open || !t) return null
  return (
    <div className="np" role="dialog" aria-modal="true" aria-label="Reproduciendo ahora">
      <div className="np-head">
        <button className="icon-btn down" onClick={() => setNp(false)} aria-label="Cerrar"><Icon name="back" size={26} /></button>
        <span className="np-ctx">{ctx?.name || 'Reproduciendo'}</span>
        <button className="icon-btn" onClick={(e) => openMenu(e, trackMenu(t))} aria-label={`Más opciones para ${t.title}`}><Icon name="dots" size={24} /></button>
      </div>
      {queue ? <div className="np-queue"><UpNext /></div> : <Cover src={t.cover} alt={`Portada de ${t.title}`} seed={t.title} className="np-cover" />}
      <div className="np-meta">
        <div>
          <div className="np-title">{t.title}</div>
          <div className="np-artist"><a href={artistHref(t)}>{t.artist}</a></div>
        </div>
        <button className={cx('icon-btn like', liked && 'on')} onClick={() => toggleLike(t)}
          aria-label={liked ? 'Quitar de favoritos' : 'Guardar en favoritos'} aria-pressed={liked}>
          <Icon name={liked ? 'heartFill' : 'heart'} size={26} />
        </button>
      </div>
      <Progress />
      <div className="np-controls">
        <button className={cx('icon-btn', shuffle && 'on')} onClick={P.toggleShuffle} aria-label="Aleatorio" aria-pressed={shuffle}><Icon name="shuffle" size={24} /></button>
        <button className="icon-btn" onClick={P.prev} aria-label="Anterior"><Icon name="prev" size={30} /></button>
        <button className={cx('play-btn', loading && isPlaying && 'loading')} onClick={P.toggle} aria-label={isPlaying ? 'Pausar' : 'Reproducir'}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={28} />
        </button>
        <button className="icon-btn" onClick={() => P.next()} aria-label="Siguiente"><Icon name="next" size={30} /></button>
        <button className={cx('icon-btn', repeat !== 'off' && 'on')} onClick={P.cycleRepeat}
          aria-label={repeat === 'one' ? 'Repetir canción' : repeat === 'all' ? 'Repetir todo' : 'Repetir desactivado'}>
          <Icon name="repeat" size={24} />{repeat === 'one' && <b className="one">1</b>}
        </button>
      </div>
      <div className="np-foot">
        <button className={cx('icon-btn', queue && 'on')} onClick={() => setQueue(!queue)} aria-label="Cola de reproducción" aria-pressed={queue}><Icon name="queue" size={22} /></button>
      </div>
    </div>
  )
}
