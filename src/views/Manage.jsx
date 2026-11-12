// Spotify Live Sync y Ajustes.
import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { Cover, Section } from '../components/Common'
import { connect, disconnect, isConnected, me, redirectUri } from '../lib/spotify'
import { checkAll, importLink } from '../lib/sync'
import { getSettings, saveSettings } from '../lib/settings'
import { clearMisses } from '../lib/matcher'
import { GENRE_LABEL } from '../lib/taste'
import { ago } from '../lib/util'
import { nav, plPath, toast, useUI } from '../store/ui'
import { useLib } from '../store/library'
import { usePlayer } from '../store/player'

function CopyField({ value, label }) {
  return (
    <div className="copy">
      <code>{value}</code>
      <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(value).then(() => toast('Copiado'))} aria-label={`Copiar ${label}`}>Copiar</button>
    </div>
  )
}

function ClientIdHelp() {
  return (
    <ol className="steps">
      <li>Entra en <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">developer.spotify.com/dashboard</a> y crea una app (gratis).</li>
      <li>En «Redirect URIs» añade exactamente:<CopyField value={redirectUri()} label="la Redirect URI" /></li>
      <li>Marca «Web API», guarda y copia el <strong>Client ID</strong> (no hace falta el secreto).</li>
      <li>Pégalo aquí debajo y pulsa «Conectar con Spotify».</li>
    </ol>
  )
}

export function Sync() {
  const lists = useLib((s) => s.lib.spotify)
  const removeSpotify = useLib((s) => s.removeSpotify)
  const sync = useUI((s) => s.sync)
  const [connected, setConnected] = useState(isConnected())
  const [profile, setProfile] = useState(null)
  const [clientId, setClientId] = useState(getSettings().spotifyClientId)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cError, setCError] = useState('')

  useEffect(() => {
    if (!connected) return
    me().then(setProfile).catch(() => setConnected(isConnected()))
  }, [connected])

  const doConnect = async () => {
    setCError('')
    const id = clientId.trim()
    if (!/^[0-9a-f]{32}$/i.test(id)) return setCError('El Client ID son 32 caracteres (letras a-f y números)')
    saveSettings({ spotifyClientId: id })
    try { await connect() } catch (e) { setCError(e.message) }
  }

  const doImport = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const r = await importLink(url)
      setUrl('')
      if (r.kind === 'track') { if (r.had) toast(`«${r.track.title}» ya estaba en Canciones que te gustan`) }
      else {
        toast(`«${r.pl.name}» ${r.kind === 'album' ? 'sincronizado' : 'sincronizada'} (${r.pl.items.length} canciones)`)
        nav(plPath('spotify', r.pl.id))
      }
    } catch (err) { setError(err.message); setConnected(isConnected()) }
    setBusy(false)
  }

  return (
    <div className="view narrow">
      <h1 className="h1"><Icon name="sync" size={30} /> Spotify Live Sync</h1>
      <p className="muted">
        Pega el enlace de una playlist pública, un álbum o una canción de Spotify y listo. Esputi busca cada canción en sus
        fuentes y mantiene las listas al día: si se añaden o quitan canciones en Spotify, aquí cambian solas. Una canción
        suelta se guarda en «Canciones que te gustan».
      </p>

      <form className="box" onSubmit={doImport} noValidate>
        <label htmlFor="plurl">Enlace de Spotify (playlist, álbum o canción)</label>
        <div className="inline">
          <input id="plurl" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/…"
            maxLength={300} autoComplete="off" inputMode="url" />
          <button className="btn primary" disabled={busy || !url.trim()}>{busy ? 'Leyendo…' : 'Sincronizar'}</button>
        </div>
        <p className="error" role="alert">{error}</p>
        <p className="muted small">En Spotify: Compartir → Copiar enlace. Las canciones que no estén en las fuentes abiertas aparecen en gris.</p>
      </form>

      <Section title="Playlists sincronizadas">
        {lists.length === 0 && <p className="muted">Aún no has sincronizado ninguna playlist.</p>}
        {lists.map((p) => (
          <div className="sync-item" key={p.id}>
            <a href={'#/' + plPath('spotify', p.id)} className="sync-main">
              <Cover src={p.image} alt={`Portada de ${p.name}`} seed={p.name} />
              <div className="lib-text">
                <div className="lib-title">{p.name}</div>
                <div className="lib-sub">{p.owner} • {p.items.length} canciones • actualizada {ago(p.syncedAt)}</div>
              </div>
            </a>
            <button className="icon-btn" onClick={() => { if (confirm(`¿Dejar de sincronizar «${p.name}»?`)) removeSpotify(p.id) }} aria-label={`Dejar de sincronizar ${p.name}`}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
        {lists.length > 0 && (
          <div className="box-row sync-status">
            <span className="muted small">
              <span className="dot ok" />
              {sync.checking ? 'Comprobando cambios…' : `Sincronización en vivo activa • última comprobación ${ago(sync.last)}`}
              {sync.error && ` • ${sync.error}`}
            </span>
            <button className="btn ghost" onClick={() => { clearMisses(); checkAll(true) }} disabled={sync.checking}>Sincronizar ahora</button>
          </div>
        )}
      </Section>

      <details className="box">
        <summary>Opcional: conectar tu cuenta de Spotify (playlists privadas o de más de 100 canciones)</summary>
        {connected ? (
          <div className="box-row">
            <span><span className="dot ok" /> Conectado{profile?.display_name ? ` como ${profile.display_name}` : ''}</span>
            <button className="btn ghost" onClick={() => { disconnect(); setConnected(false); setProfile(null) }}>Desconectar</button>
          </div>
        ) : (
          <>
            <ClientIdHelp />
            <label htmlFor="cid">Client ID de Spotify</label>
            <input id="cid" className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="32 caracteres" maxLength={40} spellCheck={false} autoComplete="off" />
            <p className="error" role="alert">{cError}</p>
            <button className="btn primary" onClick={doConnect}>Conectar con Spotify</button>
            <p className="muted small">Solo se pide permiso de lectura de tus playlists. La credencial se queda en este navegador.</p>
          </>
        )}
      </details>
    </div>
  )
}

export function Settings() {
  const session = useLib((s) => s.session)
  const logout = useLib((s) => s.logout)
  const stop = usePlayer((s) => s.stop)
  const [s, setS] = useState(getSettings())
  const prefs = useLib((x) => x.lib.prefs)
  const setPrefs = useLib((x) => x.setPrefs)
  // Las casillas se guardan al tocarlas, sin esperar al botón
  const flip = (k, v) => { setS({ ...s, [k]: v }); saveSettings({ [k]: v }) }
  // Quitar un estilo de los gustos con un toque
  const drop = (g) => setPrefs((prefs?.likes || []).filter((x) => x !== g), (prefs?.dislikes || []).filter((x) => x !== g))
  const save = (e) => {
    e.preventDefault()
    saveSettings({ spotifyClientId: s.spotifyClientId.trim(), ytKey: s.ytKey.trim(), autoplay: s.autoplay !== false })
    clearMisses()
    toast('Ajustes guardados')
  }
  return (
    <div className="view narrow">
      <h1 className="h1">Ajustes</h1>
      <form className="box" onSubmit={save} noValidate>
        <h2>Reproducción</h2>
        <label className="check">
          <input type="checkbox" checked={s.autoplay !== false} onChange={(e) => flip('autoplay', e.target.checked)} />
          <span>Música infinita: cuando se acabe lo que suena, seguir con más canciones del mismo artista y de artistas parecidos</span>
        </label>
        <h2>Pantalla apagada</h2>
        <p className="muted small">
          La música independiente (Audius e Internet Archive) se descarga en el móvil mientras suena y sigue con la pantalla apagada.
          El resto suena en directo desde YouTube y el móvil la pausa al apagar la pantalla, salvo que tu navegador tenga la opción
          «Reproducción en segundo plano» (Samsung Internet, Brave o Edge la traen en sus ajustes). En la pantalla de la canción,
          abajo, pone de dónde suena cada una.
        </p>
        <h2>Fuentes de música</h2>
        <p className="muted small">Esputi busca en Audius, YouTube e Internet Archive sin configurar nada. Si tienes tu propia clave de YouTube Data API puedes usarla aquí (opcional).</p>
        <label htmlFor="ytk">Clave de YouTube Data API v3 (opcional)</label>
        <input id="ytk" className="input" type="password" value={s.ytKey} onChange={(e) => setS({ ...s, ytKey: e.target.value })} autoComplete="off" spellCheck={false} maxLength={80} />
        <p className="muted small">Se guarda solo en este navegador.</p>
        <h2>Spotify</h2>
        <label htmlFor="scid">Client ID de Spotify</label>
        <input id="scid" className="input" value={s.spotifyClientId} onChange={(e) => setS({ ...s, spotifyClientId: e.target.value })} autoComplete="off" spellCheck={false} maxLength={40} />
        <p className="muted small">Redirect URI que debes registrar en tu app de Spotify:</p>
        <CopyField value={redirectUri()} label="la Redirect URI" />
        <button className="btn primary">Guardar ajustes</button>
      </form>
      <div className="box">
        <h2>Tus gustos</h2>
        <p>Los estilos que te gustan llenan tu portada; los que excluyes no aparecen. Toca uno para quitarlo.</p>
        <p className="muted small">Te gustan</p>
        <div className="tastes-chips">
          {(prefs?.likes || []).map((g) => <button type="button" key={g} className="chip on" onClick={() => drop(g)} aria-label={`Quitar ${GENRE_LABEL[g] || g} de tus gustos`}>{GENRE_LABEL[g] || g} ✕</button>)}
          {!(prefs?.likes || []).length && <span className="muted small">Todavía no has elegido ninguno.</span>}
        </div>
        <p className="muted small">No quieres ver</p>
        <div className="tastes-chips">
          {(prefs?.dislikes || []).map((g) => <button type="button" key={g} className="chip off" onClick={() => drop(g)} aria-label={`Dejar de excluir ${GENRE_LABEL[g] || g}`}>{GENRE_LABEL[g] || g} ✕</button>)}
          {!(prefs?.dislikes || []).length && <span className="muted small">Ninguno.</span>}
        </div>
        <a className="btn ghost" href="#/tastes">Añadir o quitar estilos</a>
      </div>
      <div className="box">
        <h2>Tu cuenta</h2>
        <p>Has entrado como <strong>{session.animal} {session.name}</strong>. Tus listas y favoritos se guardan en el servidor (solo texto) para que los tengas en cualquier equipo.</p>
        <button className="btn ghost" onClick={() => { stop(); logout() }}><Icon name="logout" size={16} /> Cerrar sesión</button>
      </div>
      <p className="muted small">
        <a href={import.meta.env.BASE_URL + 'privacidad.html'}>Política de Privacidad</a> • <a href={import.meta.env.BASE_URL + 'terminos.html'}>Términos y Condiciones</a>
      </p>
    </div>
  )
}
