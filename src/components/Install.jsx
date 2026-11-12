// Aviso para instalar Esputi como app en el móvil (o en el escritorio si el navegador lo permite).
import { useEffect, useState } from 'react'
import { store } from '../lib/util'

// El navegador puede lanzar el evento antes de que React arranque: se guarda aquí
let deferred = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()) })
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()) })
}

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)
const SNOOZE = 14 * 24 * 3600 * 1000

export default function InstallBanner() {
  const [, bump] = useState(0)
  const [hidden, setHidden] = useState(() => Date.now() - store.get('esputi.install.dismissed', 0) < SNOOZE)

  useEffect(() => {
    const f = () => bump((n) => n + 1)
    listeners.add(f)
    return () => listeners.delete(f)
  }, [])

  const ios = isIos()
  if (hidden || standalone() || (!deferred && !ios)) return null

  const dismiss = () => { store.set('esputi.install.dismissed', Date.now()); setHidden(true) }
  const install = async () => {
    const e = deferred
    deferred = null
    e.prompt()
    await e.userChoice.catch(() => {})
    setHidden(true)
  }

  return (
    <div className="cookies install" role="dialog" aria-label="Instalar Esputi">
      <img src={import.meta.env.BASE_URL + 'icon-192.png'} alt="" width="44" height="44" />
      <p>
        <strong>Instala Esputi</strong><br />
        {ios
          ? 'Pulsa Compartir y luego «Añadir a pantalla de inicio» para usarla como una app.'
          : 'Ábrela como una app, a pantalla completa y con la música sonando con la pantalla apagada.'}
      </p>
      <div className="install-btns">
        {!ios && <button className="btn primary" onClick={install}>Instalar</button>}
        <button className="btn ghost" onClick={dismiss}>{ios ? 'Entendido' : 'Ahora no'}</button>
      </div>
    </div>
  )
}
