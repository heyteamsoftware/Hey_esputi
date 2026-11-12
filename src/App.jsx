import { useEffect, useRef, useState } from 'react'
import Login from './components/Login'
import InstallBanner from './components/Install'
import UpdateBanner from './components/Update'
import { ContextMenu, CookieBanner, Library, MobileNav, Toast, TopBar } from './components/Shell'
import { PlayerBar, QueuePanel } from './components/Player'
import { Spinner } from './components/Common'
import { Artist, Home, Search } from './views/Browse'
import Playlist from './views/Playlist'
import { Settings, Sync } from './views/Manage'
import { startSync } from './lib/sync'
import { cx } from './lib/util'
import { parseRoute, useUI } from './store/ui'
import { useLib } from './store/library'
import { usePlayer } from './store/player'

function useRoute() {
  const [route, setRoute] = useState(parseRoute)
  useEffect(() => {
    const on = () => setRoute(parseRoute())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

function View({ route }) {
  switch (route.name) {
    case 'search': return <Search q={route.a} />
    case 'pl': return <Playlist key={route.a + route.b} type={route.a} id={route.b} />
    case 'artist': return <Artist id={route.a} />
    case 'sync': return <Sync />
    case 'settings': return <Settings />
    case 'library': return <div className="view lib-view"><Library route={route} /></div>
    default: return <Home />
  }
}

export default function App() {
  const session = useLib((s) => s.session)
  const ready = useLib((s) => s.ready)
  const panel = useUI((s) => s.panel)
  const route = useRoute()
  const main = useRef()

  // Sesión guardada: recupera la biblioteca del servidor
  useEffect(() => {
    const s = useLib.getState()
    if (s.session && !s.ready) s.enter(s.session)
  }, [])

  useEffect(() => (ready ? startSync() : undefined), [ready])
  useEffect(() => { main.current?.scrollTo(0, 0) }, [route.name, route.a, route.b])

  // Barra espaciadora = play / pausa
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || e.target.closest?.('input, textarea, button, a, [contenteditable]')) return
      e.preventDefault()
      usePlayer.getState().toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {!session ? <Login /> : !ready ? <div className="boot"><Spinner /></div> : (
        <div className={cx('app', panel && 'with-panel')}>
          <TopBar route={route} />
          <aside className="sidebar"><Library route={route} /></aside>
          <main className="main" ref={main}><View route={route} /></main>
          {panel && <QueuePanel />}
          <PlayerBar />
          <MobileNav route={route} />
        </div>
      )}
      <div id="yt-host" className="yt-host" />
      <ContextMenu />
      <Toast />
      <CookieBanner />
      {session && ready && <InstallBanner />}
      <UpdateBanner />
    </>
  )
}
