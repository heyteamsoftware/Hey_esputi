// Estructura fija de la app: barra superior, biblioteca lateral, navegación móvil y capas flotantes.
import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { Cover, LikedCover } from './Common'
import { cx, store } from '../lib/util'
import { api } from '../lib/api'
import { nav, plPath, useUI } from '../store/ui'
import { useLib } from '../store/library'
import { usePlayer } from '../store/player'

export function TopBar({ route }) {
  const session = useLib((s) => s.session)
  const logout = useLib((s) => s.logout)
  const stop = usePlayer((s) => s.stop)
  const openMenu = useUI((s) => s.openMenu)
  const checking = useUI((s) => s.sync.checking)
  const [q, setQ] = useState(route.name === 'search' ? route.a : '')
  const timer = useRef()

  // El buscador refleja la ruta, salvo mientras se está escribiendo en él
  useEffect(() => {
    if (document.activeElement?.id !== 'search-input') setQ(route.name === 'search' ? route.a : '')
  }, [route.name, route.a])

  const onType = (v) => {
    setQ(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => nav('search/' + encodeURIComponent(v.trim())), 350)
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <a href="#/" className="logo" aria-label="Esputi, ir al inicio">
          <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" width="32" height="32" />
        </a>
        <button className="round-btn hide-m" onClick={() => history.back()} aria-label="Atrás"><Icon name="back" /></button>
        <button className="round-btn hide-m" onClick={() => history.forward()} aria-label="Adelante"><Icon name="forward" /></button>
      </div>
      <div className="topbar-mid">
        <a href="#/" className={cx('round-btn big hide-m', route.name === 'home' && 'on')} aria-label="Inicio">
          <Icon name={route.name === 'home' ? 'homeFill' : 'home'} size={24} />
        </a>
        <form className="searchbox" role="search" onSubmit={(e) => { e.preventDefault(); nav('search/' + encodeURIComponent(q.trim())) }}>
          <Icon name="search" size={22} />
          <input value={q} onChange={(e) => onType(e.target.value)} onFocus={() => route.name !== 'search' && nav('search/' + encodeURIComponent(q.trim()))}
            id="search-input" placeholder="¿Qué quieres reproducir?" aria-label="Buscar canciones, artistas o playlists" maxLength={120} />
          {q && <button type="button" className="icon-btn" onClick={() => onType('')} aria-label="Borrar búsqueda"><Icon name="x" size={18} /></button>}
        </form>
      </div>
      <div className="topbar-right">
        <a href="#/sync" className={cx('pill hide-m', route.name === 'sync' && 'on')}>
          <Icon name="sync" size={16} className={checking ? 'spin' : ''} /> Spotify Live Sync
        </a>
        <button className="user-chip" aria-label={`Cuenta de ${session.name}`}
          onClick={(e) => openMenu(e, [
            { label: 'Ajustes', onClick: () => nav('settings') },
            { label: 'Spotify Live Sync', onClick: () => nav('sync') },
            { sep: true },
            { label: 'Cerrar sesión', onClick: () => { stop(); logout() } },
          ])}>
          <span className="avatar">{session.animal || '🎵'}</span>
          <span className="hide-m">{session.name}</span>
        </button>
      </div>
    </header>
  )
}

function LibItem({ href, active, cover, title, sub, playing }) {
  return (
    <a href={href} className={cx('lib-item', active && 'active')}>
      {cover}
      <div className="lib-text">
        <div className={cx('lib-title', playing && 'green')}>{title}</div>
        <div className="lib-sub">{sub}</div>
      </div>
      {playing && <Icon name="volume" size={16} className="green" />}
    </a>
  )
}

export function Library({ route }) {
  const lib = useLib((s) => s.lib)
  const session = useLib((s) => s.session)
  const createPlaylist = useLib((s) => s.createPlaylist)
  const ctx = usePlayer((s) => s.context)
  const playing = usePlayer((s) => s.isPlaying)
  const is = (type, id = '') => route.name === 'pl' && route.a === type && route.b === String(id)
  const on = (type, id = '') => playing && ctx?.type === type && String(ctx?.id ?? '') === String(id)
  return (
    <>
      <div className="lib-head">
        <span><Icon name="library" size={22} /> Tu biblioteca</span>
        <button className="round-btn" aria-label="Crear playlist" title="Crear playlist"
          onClick={() => { const p = createPlaylist(); nav(plPath('own', p.id)) }}>
          <Icon name="plus" />
        </button>
      </div>
      <nav className="lib-list" aria-label="Tu biblioteca">
        <LibItem href={'#/' + plPath('liked', '')} active={is('liked')} playing={on('liked')} cover={<LikedCover />}
          title="Canciones que te gustan" sub={`Playlist • ${lib.liked.length} canciones`} />
        <LibItem href="#/sync" active={route.name === 'sync'} cover={<div className="cover cover-sync"><Icon name="sync" size={22} /></div>}
          title="Spotify Live Sync" sub={lib.spotify.length ? `${lib.spotify.length} sincronizadas` : 'Trae tus playlists'} />
        {lib.playlists.map((p) => (
          <LibItem key={p.id} href={'#/' + plPath('own', p.id)} active={is('own', p.id)} playing={on('own', p.id)}
            cover={<Cover src={p.tracks[0]?.cover} alt="" seed={p.name} />} title={p.name} sub={`Playlist • ${session.name}`} />
        ))}
        {lib.spotify.map((p) => (
          <LibItem key={p.id} href={'#/' + plPath('spotify', p.id)} active={is('spotify', p.id)} playing={on('spotify', p.id)}
            cover={<Cover src={p.image} alt="" seed={p.name} />} title={p.name} sub={`Spotify • ${p.owner}`} />
        ))}
        {lib.saved.map((p) => (
          <LibItem key={p.type + p.id} href={'#/' + plPath(p.type, p.id)} active={is(p.type, p.id)} playing={on(p.type, p.id)}
            cover={<Cover src={p.cover} alt="" seed={p.name} />} title={p.name}
            sub={`${p.type === 'archive' ? 'Álbum' : 'Playlist'} • ${p.owner}`} />
        ))}
      </nav>
      <Footer />
    </>
  )
}

function Footer() {
  const [visits, setVisits] = useState(null)
  useEffect(() => {
    let hit = false
    try { hit = !sessionStorage.getItem('esputi.visit'); sessionStorage.setItem('esputi.visit', '1') } catch { /* modo privado */ }
    api.visit(hit).then((r) => setVisits(r.visits)).catch(() => {})
  }, [])
  const base = import.meta.env.BASE_URL
  return (
    <footer className="lib-foot">
      <a href={base + 'privacidad.html'}>Privacidad</a>
      <a href={base + 'terminos.html'}>Términos</a>
      <a href="#/settings">Ajustes</a>
      {visits != null && <span title="Visitas">{visits.toLocaleString('es-ES')} visitas</span>}
    </footer>
  )
}

export function MobileNav({ route }) {
  const item = (href, name, icon, label) => (
    <a href={href} className={cx(route.name === name && 'on')}><Icon name={icon} size={24} /><span>{label}</span></a>
  )
  return (
    <nav className="mobile-nav" aria-label="Navegación">
      {item('#/', 'home', route.name === 'home' ? 'homeFill' : 'home', 'Inicio')}
      {item('#/search/', 'search', 'search', 'Buscar')}
      {item('#/library', 'library', 'library', 'Biblioteca')}
      {item('#/sync', 'sync', 'sync', 'Sync')}
    </nav>
  )
}

export function ContextMenu() {
  const menu = useUI((s) => s.menu)
  const close = useUI((s) => s.closeMenu)
  const ref = useRef()
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!menu) { setPos(null); return }
    const el = ref.current
    const w = el.offsetWidth, h = el.offsetHeight
    setPos({ left: Math.max(8, Math.min(menu.x, innerWidth - w - 8)), top: Math.max(8, Math.min(menu.y, innerHeight - h - 8)) })
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', close) }
  }, [menu, close])

  if (!menu) return null
  return (
    <div className="menu-layer" onClick={close} onContextMenu={(e) => { e.preventDefault(); close() }}>
      <div className="menu" role="menu" ref={ref} style={pos || { visibility: 'hidden' }}>
        {menu.items.map((it, i) => it.sep
          ? <hr key={i} />
          : <button key={i} role="menuitem" className={cx(it.danger && 'danger')} onClick={it.onClick}>{it.label}</button>)}
      </div>
    </div>
  )
}

export function Toast() {
  const msg = useUI((s) => s.toast)
  return <div className={cx('toast', msg && 'show')} role="status" aria-live="polite">{msg}</div>
}

export function CookieBanner() {
  const [ok, setOk] = useState(() => store.get('esputi.cookies', false))
  if (ok) return null
  return (
    <div className="cookies" role="dialog" aria-label="Aviso de cookies">
      <p>
        Esputi guarda tu sesión y tus ajustes en este navegador. Al reproducir música, los servicios de origen
        (Audius, Internet Archive, YouTube) pueden usar sus propias cookies.{' '}
        <a href={import.meta.env.BASE_URL + 'privacidad.html'}>Más información</a>
      </p>
      <button className="btn primary" onClick={() => { store.set('esputi.cookies', true); setOk(true) }}>Entendido</button>
    </div>
  )
}
