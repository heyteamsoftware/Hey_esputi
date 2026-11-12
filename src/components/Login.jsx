import { useEffect, useState } from 'react'
import { ANIMALS, api } from '../lib/api'
import { useLib } from '../store/library'
import { cx } from '../lib/util'

const NAME_RE = /^[\p{L}\p{N} _.-]{2,20}$/u

export default function Login() {
  const enter = useLib((s) => s.enter)
  const [name, setName] = useState('')
  const [found, setFound] = useState({ users: [], exact: false })
  const [step, setStep] = useState(1)
  const [exists, setExists] = useState(false)
  const [animal, setAnimal] = useState(null)
  const [web, setWeb] = useState('') // honeypot: los humanos no lo ven
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Mientras se escribe, busca usuarios que ya existen
  useEffect(() => {
    const q = name.trim()
    if (q.length < 2) { setFound({ users: [], exact: false }); return }
    const t = setTimeout(() => api.search(q).then(setFound).catch(() => {}), 300)
    return () => clearTimeout(t)
  }, [name])

  const goAnimal = async (n = name) => {
    const clean = n.trim()
    setError('')
    if (!NAME_RE.test(clean)) return setError('Usa entre 2 y 20 letras o números')
    setBusy(true)
    try {
      const r = await api.search(clean)
      setName(clean); setExists(r.exact); setAnimal(null); setStep(2)
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  const submit = async () => {
    if (!animal) return setError('Elige un animal')
    setBusy(true); setError('')
    try {
      const r = exists ? await api.login(name, animal[0]) : await api.register(name, animal[0], web)
      await enter({ name: r.name, token: r.token, animal: animal[1] })
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <div className="login">
      <div className="login-box">
        <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="Logotipo de Esputi" width="56" height="56" />
        {step === 1 ? (
          <form onSubmit={(e) => { e.preventDefault(); goAnimal() }} noValidate>
            <h1>Entra en Esputi</h1>
            <p className="muted">Escribe tu nombre de usuario. Si es tu primera vez, se creará tu cuenta.</p>
            <label htmlFor="login-name">Nombre de usuario</label>
            <input id="login-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={20}
              autoComplete="username" autoFocus placeholder="Tu nombre" aria-describedby="login-err" />
            <input className="hp" tabIndex={-1} autoComplete="off" value={web} onChange={(e) => setWeb(e.target.value)} name="web" aria-hidden="true" />
            {found.users.length > 0 && (
              <div className="suggest">
                <span className="muted">¿Eres tú?</span>
                {found.users.map((u) => (
                  <button type="button" key={u} className="chip" onClick={() => goAnimal(u)}>{u}</button>
                ))}
              </div>
            )}
            <p id="login-err" className="error" role="alert">{error}</p>
            <button className="btn primary wide" disabled={busy || name.trim().length < 2}>Continuar</button>
          </form>
        ) : (
          <div>
            <h1>{exists ? `Hola de nuevo, ${name}` : `Encantados, ${name}`}</h1>
            <p className="muted">
              {exists ? 'Elige tu animal para entrar.' : 'Elige un animal: será tu contraseña. ¡Recuérdalo!'}
            </p>
            <div className="animals" role="radiogroup" aria-label="Animales">
              {ANIMALS.map((a) => (
                <button key={a[0]} type="button" role="radio" aria-checked={animal?.[0] === a[0]} aria-label={a[0]} title={a[0]}
                  className={cx('animal', animal?.[0] === a[0] && 'on')} onClick={() => { setAnimal(a); setError('') }}>
                  {a[1]}
                </button>
              ))}
            </div>
            <p className="error" role="alert">{error}</p>
            <button className="btn primary wide" disabled={busy || !animal} onClick={submit}>{exists ? 'Entrar' : 'Crear mi cuenta'}</button>
            <button className="btn ghost wide" onClick={() => { setStep(1); setError('') }}>Cambiar de usuario</button>
          </div>
        )}
        <p className="legal">
          Al continuar aceptas los <a href={import.meta.env.BASE_URL + 'terminos.html'}>Términos</a> y la{' '}
          <a href={import.meta.env.BASE_URL + 'privacidad.html'}>Política de Privacidad</a>.
        </p>
      </div>
    </div>
  )
}
