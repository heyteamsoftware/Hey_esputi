// Gustos musicales: los estilos que te gustan y los que no quieres ver.
// Al crear el usuario (o la primera vez, si ya existía) sale como mini encuesta de 5 y 5;
// después, desde Ajustes, se pueden añadir y quitar todos los que se quiera.
import { useState } from 'react'
import { GENRE_LABEL, STYLES } from '../lib/taste'
import { cx } from '../lib/util'
import { useLib } from '../store/library'
import { nav, toast } from '../store/ui'

function Picker({ title, hint, value, other, onChange, bad, max }) {
  const full = value.length >= max
  const flip = (g) => {
    if (value.includes(g)) onChange(value.filter((x) => x !== g))
    else if (!full) onChange([...value, g])
  }
  return (
    <fieldset className="tastes-set">
      <legend>{title} <span className="muted">{value.length}{isFinite(max) ? '/' + max : ''}</span></legend>
      <p className="muted small">{hint}</p>
      <div className="tastes-chips">
        {STYLES.filter((g) => !other.includes(g)).map((g) => {
          const on = value.includes(g)
          return (
            <button type="button" key={g} aria-pressed={on} disabled={!on && full}
              className={cx('chip', on && (bad ? 'off' : 'on'))} onClick={() => flip(g)}>
              {GENRE_LABEL[g] || g}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function Tastes({ first }) {
  const session = useLib((s) => s.session)
  const prefs = useLib((s) => s.lib.prefs)
  const setPrefs = useLib((s) => s.setPrefs)
  const [likes, setLikes] = useState(prefs?.likes || [])
  const [dislikes, setDislikes] = useState(prefs?.dislikes || [])
  // La encuesta inicial es corta; en Ajustes no hay tope
  const max = first ? 5 : Infinity

  const save = (e) => {
    e.preventDefault()
    if (!likes.length) return
    setPrefs(likes, dislikes)
    toast('Gustos guardados: la portada se adapta a ti')
    if (!first) nav('')
  }
  const skip = () => { setPrefs([], []); if (!first) nav('') }

  const form = (
    <form onSubmit={save} className="tastes">
      <Picker title="¿Qué estilos te gustan?" max={max} value={likes} other={dislikes} onChange={setLikes}
        hint={first ? 'Elige hasta 5 para empezar. Luego podrás añadir más en Ajustes.' : 'Toca para añadir o quitar. Los primeros que elijas mandan más en tu portada.'} />
      <Picker title="¿Qué estilos no quieres ver?" max={max} bad value={dislikes} other={likes} onChange={setDislikes}
        hint={first ? 'Elige hasta 5. No te los enseñaremos en la portada.' : 'Toca para añadir o quitar. No te los enseñaremos en la portada.'} />
      <button className="btn primary wide" disabled={!likes.length}>Guardar mis gustos</button>
      <button type="button" className="tastes-skip" onClick={skip}>{first ? 'Ahora no' : 'Borrar mis gustos'}</button>
    </form>
  )

  if (!first) return <div className="view settings"><h1>Tus gustos</h1><div className="box">{form}</div></div>
  return (
    <div className="login">
      <div className="login-box tastes-box">
        <h1>Hola, {session.name}</h1>
        <p className="muted">Cuéntanos qué música te va para enseñarte lo que te gusta desde el principio.</p>
        {form}
      </div>
    </div>
  )
}
