// "Pantalla en negro": cuando la canción que suena necesita la pantalla encendida para no
// cortarse, tras unos segundos sin tocar el móvil la app se queda en negro (como apagada)
// y no reacciona a toques sueltos. Dos toques seguidos la devuelven.
import { useEffect, useRef, useState } from 'react'
import { engine } from '../lib/engine'
import { usePlayer } from '../store/player'

const IDLE = 25000

export default function Pocket() {
  const [dark, setDark] = useState(false)
  const [hint, setHint] = useState(false)
  const title = usePlayer((s) => s.current?.title)
  const artist = usePlayer((s) => s.current?.artist)
  const last = useRef(Date.now())
  const tap = useRef(0)
  const hintTimer = useRef()

  const showHint = (ms) => { setHint(true); clearTimeout(hintTimer.current); hintTimer.current = setTimeout(() => setHint(false), ms) }

  useEffect(() => {
    const touch = () => { last.current = Date.now() }
    const opts = { passive: true, capture: true }
    window.addEventListener('pointerdown', touch, opts)
    window.addEventListener('keydown', touch, opts)
    const timer = setInterval(() => {
      if (!engine.needsScreen()) { setDark(false); return }
      if (!document.hidden && Date.now() - last.current > IDLE) setDark((d) => { if (!d) showHint(4000); return true })
    }, 1000)
    return () => { clearInterval(timer); clearTimeout(hintTimer.current); window.removeEventListener('pointerdown', touch, opts); window.removeEventListener('keydown', touch, opts) }
  }, [])

  if (!dark) return null
  const onTap = () => {
    const now = Date.now()
    if (now - tap.current < 450) { last.current = now; setDark(false); return }
    tap.current = now
    showHint(2500)
  }
  return (
    <div className="pocket" role="button" tabIndex={0} aria-label="Pantalla en negro. Toca dos veces para volver." onPointerDown={onTap}
      onKeyDown={() => { last.current = Date.now(); setDark(false) }}>
      {hint && (
        <div className="pocket-hint">
          <strong>{title}</strong>
          <span>{artist}</span>
          <em>Pantalla en negro para que la música no se corte.<br />No pulses el botón de apagado. Toca dos veces para volver.</em>
        </div>
      )}
    </div>
  )
}
