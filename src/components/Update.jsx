// Cartel de "Nueva versión": compara la compilación en uso con la publicada en el servidor.
import { useEffect, useState } from 'react'

const CURRENT = typeof __BUILD__ !== 'undefined' ? __BUILD__ : ''
const EVERY = 5 * 60 * 1000

export default function UpdateBanner() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!CURRENT || import.meta.env.DEV) return
    let stop = false
    const check = async () => {
      if (stop || document.hidden) return
      try {
        const r = await fetch(import.meta.env.BASE_URL + 'version.json?t=' + Date.now(), { cache: 'no-store' })
        const j = await r.json()
        if (j.build && j.build !== CURRENT) setReady(true)
      } catch { /* sin conexión: se reintenta luego */ }
    }
    const timer = setInterval(check, EVERY)
    document.addEventListener('visibilitychange', check)
    setTimeout(check, 20000)
    return () => { stop = true; clearInterval(timer); document.removeEventListener('visibilitychange', check) }
  }, [])

  if (!ready) return null
  return (
    <div className="cookies update" role="alert">
      <p><strong>Nueva versión de Esputi</strong><br />Actualiza para tener las últimas mejoras. Tus listas no se pierden.</p>
      <div className="install-btns">
        <button className="btn primary" onClick={() => location.reload()}>Actualizar</button>
        <button className="btn ghost" onClick={() => setReady(false)}>Luego</button>
      </div>
    </div>
  )
}
