// Inicio, búsqueda y página de artista.
import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { ArtistCard, ContextCard, Cover, Empty, LikedCover, PlayFab, Section, Spinner, TrackCard } from '../components/Common'
import TrackList from '../components/TrackList'
import { audius, GENRES } from '../lib/sources/audius'
import { archive } from '../lib/sources/archive'
import { youtube } from '../lib/sources/youtube'
import { cx, hueOf, norm } from '../lib/util'
import { nav, plPath } from '../store/ui'
import { useLib } from '../store/library'
import { usePlayer } from '../store/player'
import { playContext } from '../lib/contexts'
import { GENRE_LABEL, taste, tasteKey } from '../lib/taste'

// Carga asíncrona con estado; ignora respuestas de peticiones antiguas
export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  useEffect(() => {
    let alive = true
    setState({ loading: true, data: null, error: null })
    fn().then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((error) => alive && setState({ loading: false, data: null, error }))
    return () => { alive = false }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

const cache = new Map()
const cached = (key, fn) => () => {
  if (cache.has(key)) return Promise.resolve(cache.get(key))
  return fn().then((d) => { cache.set(key, d); return d })
}

function Shelf({ title, state, more, render }) {
  if (state.error || (!state.loading && !state.data?.length)) return null
  return (
    <Section title={title} more={more}>
      {state.loading ? <Spinner /> : <div className="shelf">{state.data.slice(0, 10).map(render)}</div>}
    </Section>
  )
}

function TrackShelf({ title, genre }) {
  const st = useAsync(cached('trend:' + (genre || ''), () => audius.trending(genre, 30)), [genre])
  const playList = usePlayer((s) => s.playList)
  const ctx = { type: 'genre', id: genre || '', name: genre || 'Tendencias', cover: st.data?.[0]?.cover }
  return (
    <Shelf title={title} state={st} more={{ label: 'Mostrar todo', onClick: () => nav(plPath('genre', genre || '')) }}
      render={(t, i) => <TrackCard key={t.id} track={t} onPlay={() => playList(st.data, i, ctx)} />} />
  )
}

function QuickTile({ item }) {
  const active = usePlayer((s) => s.context?.type === item.type && String(s.context?.id ?? '') === String(item.id ?? ''))
  const playing = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  return (
    <a className="tile" href={'#/' + plPath(item.type, item.id)}>
      {item.type === 'liked' ? <LikedCover /> : <Cover src={item.cover} alt="" seed={item.name} />}
      <span className="tile-name">{item.name}</span>
      <span className={cx('tile-play', active && playing && 'show')}>
        <PlayFab small playing={active && playing} label={`Reproducir ${item.name}`}
          onClick={(e) => { e.preventDefault(); active ? toggle() : playContext(item) }} />
      </span>
    </a>
  )
}

export function Home() {
  const session = useLib((s) => s.session)
  const lib = useLib((s) => s.lib)
  const recents = useLib((s) => s.recents)
  const playlists = useAsync(cached('pls', () => audius.trendingPlaylists(12)), [])
  const albums = useAsync(cached('ia', () => archive.featured(12)), [])
  const searches = useLib((s) => s.searches)
  const playList = usePlayer((s) => s.playList)
  // Gustos del usuario: canciones "para ti" y estilos preferidos
  const mine = useAsync(() => taste(lib, searches), [tasteKey(lib, searches)])
  const DEFAULT = ['Electronic', 'Hip-Hop/Rap', 'Lo-Fi', 'Rock']
  const genres = [...new Set([...(mine.data?.genres || []), ...DEFAULT])].slice(0, 5)
  const forYou = { loading: false, error: null, data: mine.data?.tracks || [] }
  const fyCtx = { type: 'foryou', id: '', name: 'Hecho para ti' }
  const h = new Date().getHours()
  const hello = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'

  const seen = new Set(['liked:'])
  const tiles = [{ type: 'liked', id: '', name: 'Canciones que te gustan' }]
  const add = (x) => { const k = x.type + ':' + (x.id ?? ''); if (!seen.has(k) && tiles.length < 8) { seen.add(k); tiles.push(x) } }
  recents.forEach(add)
  lib.spotify.forEach((p) => add({ type: 'spotify', id: p.id, name: p.name, cover: p.image }))
  lib.playlists.forEach((p) => add({ type: 'own', id: p.id, name: p.name, cover: p.tracks[0]?.cover }))
  if (tiles.length < 4) add({ type: 'genre', id: '', name: 'Tendencias de la semana' })

  return (
    <div className="view home">
      <h1 className="hello">{hello}, {session.name}</h1>
      <div className="tiles">{tiles.map((t) => <QuickTile key={t.type + t.id} item={t} />)}</div>
      {lib.spotify.length === 0 && (
        <a className="promo" href="#/sync">
          <Icon name="sync" size={28} />
          <div><strong>Trae tus playlists de Spotify</strong><span>Pega el enlace y Esputi las mantiene sincronizadas en vivo.</span></div>
          <span className="btn primary">Empezar</span>
        </a>
      )}
      <Shelf title={`Hecho para ti, ${session.name}`} state={forYou}
        render={(t, i) => <TrackCard key={t.id} track={t} onPlay={() => playList(forYou.data, i, fyCtx)} />} />
      <TrackShelf title="Tendencias de la semana" />
      {genres.slice(0, 2).map((g, i) => (
        <TrackShelf key={g} genre={g} title={mine.data?.genres?.includes(g) ? `Porque te gusta: ${GENRE_LABEL[g] || g}` : (GENRE_LABEL[g] || g)} />
      ))}
      <Shelf title="Playlists populares" state={playlists} render={(p) => <ContextCard key={p.id} item={p} />} />
      {genres.slice(2).map((g) => (
        <TrackShelf key={g} genre={g} title={mine.data?.genres?.includes(g) ? `Porque te gusta: ${GENRE_LABEL[g] || g}` : (GENRE_LABEL[g] || g)} />
      ))}
      <Shelf title="Álbumes libres en Internet Archive" state={albums} render={(p) => <ContextCard key={p.id} item={p} />} />
      <p className="credits">
        Música servida por <a href="https://audius.co" rel="noopener noreferrer" target="_blank">Audius</a>,{' '}
        <a href="https://archive.org" rel="noopener noreferrer" target="_blank">Internet Archive</a> y YouTube. Esputi no aloja audio.
      </p>
    </div>
  )
}

// Búsqueda única: el usuario no elige fuente; se consultan todas a la vez
async function searchAll(q) {
  const [a, yt, users, lists, ia, famous] = await Promise.all([
    audius.searchTracks(q, 30).catch(() => []),
    youtube.searchTracks(q, 10).catch(() => []),
    audius.searchUsers(q, 12).catch(() => []),
    audius.searchPlaylists(q, 20).catch(() => []),
    // Archive puede tardar: si no responde pronto, no retrasa el resto
    Promise.race([archive.searchAlbums(q).catch(() => []), new Promise((r) => setTimeout(() => r([]), 3500))]),
    Promise.race([famousArtists(q).catch(() => []), new Promise((r) => setTimeout(() => r([]), 3000))]),
  ])
  return {
    tracks: rank(q, interleave(yt, a)),
    users: artistsFor(q, users, yt, famous),
    albums: [...lists.filter((p) => p.isAlbum), ...ia],
    pls: lists.filter((p) => !p.isAlbum),
  }
}

// Ordena por cuántas palabras de la búsqueda aparecen en "artista + título" (a igualdad, se respeta el orden)
function rank(q, list) {
  const words = norm(q).split(' ').filter(Boolean)
  const hit = (t) => { const hay = ' ' + norm(t.artist + ' ' + t.title) + ' '; return words.filter((w) => hay.includes(' ' + w + ' ')).length }
  return list.map((t, i) => [t, hit(t), i]).sort((x, y) => y[1] - x[1] || x[2] - y[2]).map((x) => x[0])
}

// Artistas por popularidad: primero los del catálogo general (iTunes los devuelve ordenados
// por fama) y después los de Audius que contienen las palabras buscadas, por seguidores
function artistsFor(q, users, yt, famous) {
  const words = norm(q).split(' ').filter((w) => w.length > 2)
  const nq = norm(q)
  const fits = (name) => { const n = norm(name); return words.length ? words.every((w) => n.includes(w)) : n.includes(nq) }
  const out = [], seen = new Set()
  const add = (name, cover) => { const k = norm(name); if (k && !seen.has(k)) { seen.add(k); out.push({ id: 'yt:' + name, name, cover }) } }
  const mine = yt.filter((t) => fits(t.artist + ' ' + t.title))
  famous.filter(fits).forEach((name, i) => add(name, i === 0 ? mine[0]?.cover : ''))
  if (!out.length && mine.length >= 3) {
    const channel = mine.find((t) => norm(t.artist) === nq)
    add(channel ? channel.artist : q.trim().replace(/(^|[ ])[a-zñáéíóú]/g, (c) => c.toUpperCase()), (channel || mine[0]).cover)
  }
  const fromAudius = users.filter((u) => fits(u.name) && !seen.has(norm(u.name))).sort((x, y) => (y.followers || 0) - (x.followers || 0))
  return [...out, ...fromAudius]
}

// Artistas conocidos con ese nombre, de más a menos popular (catálogo público de iTunes)
async function famousArtists(q) {
  const r = await fetch('https://itunes.apple.com/search?entity=musicArtist&limit=5&term=' + encodeURIComponent(q))
  return ((await r.json()).results || []).map((x) => x.artistName).filter(Boolean)
}

// Alterna dos listas: a1, b1, a2, b2…
const interleave = (x, y) => { const out = []; for (let i = 0; i < Math.max(x.length, y.length); i++) { if (x[i]) out.push(x[i]); if (y[i]) out.push(y[i]) } return out }

const FILTERS = [['all', 'Todo'], ['tracks', 'Canción'], ['users', 'Artista'], ['albums', 'Álbum']]

export function Search({ q }) {
  const st = useAsync(() => (q ? searchAll(q) : Promise.resolve(null)), [q])
  const [filter, setFilter] = useState('all')
  if (!q) {
    return (
      <div className="view">
        <h1 className="h1">Explorar todo</h1>
        <div className="genres">
          {GENRES.map((g) => (
            <a key={g} href={'#/' + plPath('genre', g)} className="genre" style={{ background: `hsl(${hueOf(g)} 60% 38%)` }}>{g}</a>
          ))}
        </div>
      </div>
    )
  }
  const d = st.data
  const all = filter === 'all'
  const ctx = { type: 'search', id: q, name: `Búsqueda: ${q}` }
  const nothing = d && (all ? !d.tracks.length && !d.users.length && !d.albums.length && !d.pls.length : !d[filter].length)
  const what = { all: 'resultados', tracks: 'canciones', users: 'artistas', albums: 'álbumes' }[filter]
  return (
    <div className="view">
      <div className="tabs" role="tablist" aria-label="Tipo de resultado">
        {FILTERS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} className={cx('chip', filter === id && 'on')} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {st.loading || !d ? <Spinner /> : nothing ? (
        <Empty icon="search" title={`Sin ${what} para «${q}»`}>Prueba con otras palabras{all ? '' : ' o cambia el filtro'}.</Empty>
      ) : (
        <>
          {(all || filter === 'users') && d.users.length > 0 && (
            <Section title="Artistas"><div className={all ? 'shelf' : 'grid'}>{d.users.map((u) => <ArtistCard key={u.id} artist={u} />)}</div></Section>
          )}
          {(all || filter === 'tracks') && d.tracks.length > 0 && (
            <Section title="Canciones"><TrackList tracks={all ? d.tracks.slice(0, 8) : d.tracks} context={ctx} header={false} /></Section>
          )}
          {(all || filter === 'albums') && d.albums.length > 0 && (
            <Section title="Álbumes"><div className={all ? 'shelf' : 'grid'}>{d.albums.map((p) => <ContextCard key={p.type + p.id} item={p} />)}</div></Section>
          )}
          {all && d.pls.length > 0 && (
            <Section title="Playlists"><div className="shelf">{d.pls.map((p) => <ContextCard key={p.id} item={p} />)}</div></Section>
          )}
        </>
      )}
    </div>
  )
}

export function Artist({ id }) {
  const isYt = id.startsWith('yt:')
  const st = useAsync(() => (isYt
    ? youtube.searchTracks(id.slice(3), 10).then((t) => [{ name: id.slice(3), cover: t[0]?.cover, external: true }, rank(id.slice(3), t)])
    : Promise.all([audius.user(id), audius.userTracks(id, 50)])), [id])
  const playList = usePlayer((s) => s.playList)
  const active = usePlayer((s) => s.context?.type === 'artist' && s.context?.id === id)
  const playing = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  if (st.loading) return <div className="view"><Spinner /></div>
  if (st.error) return <div className="view"><Empty icon="alert" title="No se pudo cargar el artista">Inténtalo de nuevo.</Empty></div>
  const [u, tracks] = st.data
  const ctx = { type: 'artist', id, name: u.name, cover: u.cover }
  return (
    <div className="view pl">
      <div className="pl-head" style={{ '--h': hueOf(u.name) }}>
        <Cover round src={u.cover} alt={`Foto de ${u.name}`} seed={u.name} className="pl-cover" />
        <div className="pl-info">
          <span className="pl-kind">{u.verified ? 'Artista verificado' : 'Artista'}</span>
          <h1>{u.name}</h1>
          {!u.external && <p className="pl-meta">{(u.followers || 0).toLocaleString('es-ES')} seguidores</p>}
        </div>
      </div>
      <div className="pl-actions">
        <PlayFab playing={active && playing} onClick={() => (active ? toggle() : playList(tracks, 0, ctx))} />
      </div>
      {tracks.length ? <Section title="Populares"><TrackList tracks={tracks} context={ctx} header={false} /></Section>
        : <Empty title="Este artista aún no tiene canciones" />}
    </div>
  )
}
