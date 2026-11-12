// Barra de reproducción inferior y panel derecho con la cola.
import { useState } from 'react'
import Icon from './Icon'
import { Cover } from './Common'
import { cx, fmtTime } from '../lib/util'
import { usePlayer } from '../store/player'
import { useLib } from '../store/library'
import { useUI } from '../store/ui'
import { trackMenu } from './TrackList'

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
  const [drag, setDrag] = useState(null)
  const shown = drag ?? time
  return (
    <div className="progress">
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

  return (
    <footer className="player" aria-label="Reproductor">
      <div className="player-left">
        {t ? (
          <>
            <Cover src={t.cover} alt={`Portada de ${t.title}`} seed={t.title} className="player-cover" />
            <div className="player-text" onContextMenu={(e) => openMenu(e, trackMenu(t))}>
              <div className="player-title">{t.title}</div>
              <div className="player-artist">
                {t.artistId ? <a href={'#/artist/' + t.artistId}>{t.artist}</a> : t.artist}
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
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const t = usePlayer((s) => s.current)
  const ctx = usePlayer((s) => s.context)
  const jump = usePlayer((s) => s.jump)
  const removeAt = usePlayer((s) => s.removeAt)
  const togglePanel = useUI((s) => s.togglePanel)
  const upcoming = queue.map((q, i) => [q, i]).slice(index + 1, index + 51)

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
            <h3>A continuación</h3>
            {upcoming.length === 0 && <p className="muted small">No hay más canciones en la cola.</p>}
            {upcoming.map(([q, i]) => (
              <div className="q-item" key={q.id + i} onDoubleClick={() => jump(i)}>
                <button className="q-play" onClick={() => jump(i)} aria-label={`Reproducir ${q.title}`}>
                  <Cover src={q.cover} alt="" seed={q.title} />
                </button>
                <div className="lib-text">
                  <div className="lib-title">{q.title}</div>
                  <div className="lib-sub">{q.artist}</div>
                </div>
                <button className="icon-btn more" onClick={() => removeAt(i)} aria-label={`Quitar ${q.title} de la cola`}><Icon name="x" size={16} /></button>
              </div>
            ))}
          </>
        ) : <p className="muted small">Tu cola está vacía. Reproduce algo y aparecerá aquí.</p>}
      </div>
    </aside>
  )
}
