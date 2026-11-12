import { useEffect, useState } from 'react'
import { ANIMALS, api } from '../lib/api'
import { useLib } from '../store/library'
import { cx } from '../lib/util'

const NAME_RE = /^[\p{L}\p{N} _.-]{2,20}$/u

export default function Login() {
  const enter = useLib((s) => s.enter)
  const [name, setName] = useState('')
  const [exists, setExists] = useState(null) // null = aún no se sabe
  const [animal, setAnimal] = useState(null)
  const [web, setWeb] = useState('') // honeypot: los humanos no lo ven
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Mientras se escribe, se mira si ese usuario ya existe (para el texto del botón)
  useEffect(() => {
    const q = name.trim()
    setExists(null)
    if (q.length < 2) return
    const t = setTimeout(() => api.search(q).then((r) => setExists(!!r.exact)).catch(() => {}), 300)
    return () => clearTimeout(t)
  }, [name])

  const submit = async (e) => {
    e.preventDefault()
    const clean = name.trim()
    if (!NAME_RE.test(clean)) return setError('El nombre debe tener entre 2 y 20 letras o números')
    if (!animal) return setError('Elige un animal')
    setBusy(true); setError('')
    try {
      const known = (await api.search(clean)).exact
      const r = known ? await api.login(clean, animal[0]) : await api.register(clean, animal[0], web)
      await enter({ name: r.name, token: r.token, animal: animal[1] })
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <div className="login">
      <div className="login-box">
        <img src={import.meta.env.BASE_URL + 'favicon.svg?v=2'} alt="Logotipo de Esputi" width="56" height="56" />
        <form onSubmit={submit} noValidate>
          <h1>Entra en Esputi</h1>
          <label htmlFor="login-name">Nombre</label>
          <input id="login-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setError('') }} maxLength={20}
            autoComplete="username" autoFocus aria-describedby="login-err" />
          <input className="hp" tabIndex={-1} autoComplete="off" value={web} onChange={(e) => setWeb(e.target.value)} name="web" aria-hidden="true" />
          <label id="login-animal">Animal</label>
          <div className="animals" role="radiogroup" aria-labelledby="login-animal">
            {ANIMALS.map((a) => (
              <button key={a[0]} type="button" role="radio" aria-checked={animal?.[0] === a[0]} aria-label={a[0]} title={a[0]}
                className={cx('animal', animal?.[0] === a[0] && 'on')} onClick={() => { setAnimal(a); setError('') }}>
                {a[1]}
              </button>
            ))}
          </div>
          <p id="login-err" className="error" role="alert">{error}</p>
          <button className="btn primary wide" disabled={busy || name.trim().length < 2 || !animal}>{exists === false ? 'Crear mi cuenta' : 'Entrar'}</button>
        </form>
        <p className="legal">
          Al continuar aceptas los <a href={import.meta.env.BASE_URL + 'terminos.html'}>Términos</a> y la{' '}
          <a href={import.meta.env.BASE_URL + 'privacidad.html'}>Política de Privacidad</a>.
        </p>
      </div>
    </div>
  )
}
