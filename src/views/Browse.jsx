// Inicio, búsqueda y ficha de artista.
import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { ArtistCard, ContextCard, Cover, Empty, LikedCover, PlayFab, Section, Spinner, TrackCard } from '../components/Common'
import TrackList, { albumPath, artistHref } from '../components/TrackList'
import { audius, GENRES } from '../lib/sources/audius'
import { archive } from '../lib/sources/archive'
import { youtube } from '../lib/sources/youtube'
import { catalog, CHART } from '../lib/catalog'
import { searchAll } from '../lib/search'
import { cx, hueOf, norm } from '../lib/util'
import { nav, plPath } from '../store/ui'
import { useLib } from '../store/library'
import { usePlayer } from '../store/player'
import { playContext } from '../lib/contexts'
import { GENRE_LABEL, STYLES, excluded, taste, tasteKey } from '../lib/taste'
import { because, hasLegends, legendArtists, legendLists, mainLegends } from '../lib/legends'

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
  const dislikes = useLib((s) => s.lib.prefs?.dislikes)
  const raw = useAsync(cached('trend:' + (genre || ''), () => audius.trending(genre, 30)), [genre])
  // Fuera lo que el usuario excluyó en la encuesta de gustos
  const st = raw.data && dislikes?.length ? { ...raw, data: raw.data.filter((t) => !excluded(t, dislikes)) } : raw
  const playList = usePlayer((s) => s.playList)
  const ctx = { type: 'genre', id: genre || '', name: genre || 'Tendencias', cover: st.data?.[0]?.cover }
  return (
    <Shelf title={title} state={st} more={{ label: 'Mostrar todo', onClick: () => nav(plPath('genre', genre || '')) }}
      render={(t, i) => <TrackCard key={t.id} track={t} onPlay={() => playList(st.data, i, ctx)} />} />
  )
}

// Éxitos del catálogo (los conocidos) de un estilo, o generales si no se indica
function ChartShelf({ title, genre = '' }) {
  const dislikes = useLib((s) => s.lib.prefs?.dislikes)
  const raw = useAsync(cached('chart:' + genre, () => catalog.chart(genre, 40)), [genre])
  // Fuera lo que el usuario excluyó en sus gustos
  const st = raw.data && dislikes?.length ? { ...raw, data: raw.data.filter((t) => !excluded(t, dislikes)) } : raw
  const playList = usePlayer((s) => s.playList)
  const ctx = { type: 'chart', id: genre, name: title, cover: st.data?.[0]?.cover }
  return (
    <Shelf title={title} state={st} more={{ label: 'Mostrar todo', onClick: () => nav(plPath('chart', genre)) }}
      render={(t, k) => <TrackCard key={t.id} track={t} onPlay={() => playList(st.data, k, ctx)} />} />
  )
}

// "Porque te gusta el rock": sus listas imprescindibles y los grupos famosos del estilo
function BecauseShelf({ genre, title }) {
  const lists = legendLists(genre)
  if (!lists.length) return null
  return (
    <Section title={title || `Porque te gusta ${because(genre)}`} more={{ label: 'Mostrar todo', onClick: () => nav('style/' + encodeURIComponent(genre)) }}>
      <div className="shelf">
        {lists.map((l) => <ContextCard key={l.id} item={l} />)}
        {legendArtists(genre, 10 - lists.length).map((a) => <ArtistCard key={a.id} artist={a} />)}
      </div>
    </Section>
  )
}

// Página de un estilo: los imprescindibles, los éxitos de ahora y, al final, lo independiente
export function Style({ genre }) {
  const label = GENRE_LABEL[genre] || genre
  return (
    <div className="view">
      <h1 className="h1">{label}</h1>
      {hasLegends(genre) && (
        <>
          <Section title="Listas imprescindibles"><div className="shelf">{legendLists(genre).map((l) => <ContextCard key={l.id} item={l} />)}</div></Section>
          <Section title="Los más grandes"><div className="shelf">{legendArtists(genre, 12).map((a) => <ArtistCard key={a.id} artist={a} />)}</div></Section>
        </>
      )}
      {CHART[genre] && <ChartShelf genre={genre} title={`Éxitos de ${label}`} />}
      {GENRES.includes(genre) && <TrackShelf genre={genre} title="Música independiente en tendencia" />}
    </div>
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
  const likes = lib.prefs?.likes || [], dislikes = lib.prefs?.dislikes || []
  const liked = [...new Set([...likes, ...(mine.data?.genres || [])])]
  // Música independiente (Audius): solo de los estilos que existen allí, hasta tres
  const genres = [...new Set([...liked, ...DEFAULT])].filter((g) => GENRES.includes(g) && !dislikes.includes(g)).slice(0, 3)
  // Sus estilos, con los grupos famosos de cada uno (hasta cinco)
  const fav = liked.filter((g) => hasLegends(g) && !dislikes.includes(g)).slice(0, 5)
  const classics = mainLegends([...fav, ...dislikes])
  // Éxitos de ahora de sus estilos preferidos (hasta dos)
  const charts = liked.filter((g) => CHART[g] && !dislikes.includes(g)).slice(0, 2)
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
      {fav.slice(0, 2).map((g) => <BecauseShelf key={g} genre={g} />)}
      <ChartShelf title="Éxitos del momento" />
      {fav.slice(2, 3).map((g) => <BecauseShelf key={g} genre={g} />)}
      {charts.map((g) => <ChartShelf key={g} genre={g} title={`Éxitos de ${GENRE_LABEL[g] || g}`} />)}
      {fav.slice(3).map((g) => <BecauseShelf key={g} genre={g} />)}
      {classics.length > 0 && (
        <Section title={fav.length ? 'Más listas imprescindibles' : 'Listas imprescindibles'}>
          <div className="shelf">{classics.slice(0, 10).map((l) => <ContextCard key={l.id} item={l} />)}</div>
        </Section>
      )}
      {/* Lo independiente y las tendencias de la comunidad van al final */}
      {genres.slice(0, 3).map((g) => (
        <TrackShelf key={g} genre={g} title={`Música independiente: ${GENRE_LABEL[g] || g}`} />
      ))}
      <Shelf title="Playlists de la comunidad" state={playlists} render={(p) => <ContextCard key={p.id} item={p} />} />
      <Shelf title="Álbumes libres en Internet Archive" state={albums} render={(p) => <ContextCard key={p.id} item={p} />} />
      <TrackShelf title="Tendencias de la semana" />
      <p className="credits">
        Música servida por <a href="https://audius.co" rel="noopener noreferrer" target="_blank">Audius</a>,{' '}
        <a href="https://archive.org" rel="noopener noreferrer" target="_blank">Internet Archive</a> y YouTube. Esputi no aloja audio.
      </p>
    </div>
  )
}

const FILTERS = [['all', 'Todo'], ['tracks', 'Canción'], ['artists', 'Artista'], ['albums', 'Álbum']]

// "Resultado principal": lo que más probablemente se estaba buscando
function TopResult({ top, onPlayTrack }) {
  const { kind, item } = top
  const isTrack = kind === 'track'
  const ctxItem = kind === 'artist' ? { type: 'artist', id: item.id, name: item.name } : item
  const active = usePlayer((s) => (isTrack ? s.current?.id === item.id : s.context?.type === ctxItem.type && String(s.context?.id) === String(ctxItem.id)))
  const playing = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  const go = () => { location.hash = isTrack ? (item.albumId ? '#/' + albumPath(item) : artistHref(item)) : '#/' + plPath(ctxItem.type, ctxItem.id) }
  const play = (e) => { e.stopPropagation(); if (active) toggle(); else if (isTrack) onPlayTrack(); else playContext(ctxItem) }
  const name = isTrack ? item.title : item.name
  return (
    <div className="top-result" role="link" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()}>
      <Cover round={kind === 'artist'} src={item.cover} alt="" seed={name} className="top-cover" />
      <div className={cx('top-name', name.length > 22 && 'long')}>{name}</div>
      <div className="top-sub">
        <span className="chip-kind">{kind === 'artist' ? 'Artista' : isTrack ? 'Canción' : item.kind || 'Álbum'}</span>
        <span>{isTrack ? item.artist : kind === 'album' ? item.owner : ''}</span>
      </div>
      <div className={cx('top-play', active && playing && 'show')}><PlayFab playing={active && playing} onClick={play} label={`Reproducir ${name}`} /></div>
    </div>
  )
}

export function Search({ q }) {
  const st = useAsync(() => (q ? searchAll(q) : Promise.resolve(null)), [q])
  const [filter, setFilter] = useState('all')
  const playList = usePlayer((s) => s.playList)
  if (!q) {
    return (
      <div className="view">
        <h1 className="h1">Explorar todo</h1>
        <div className="genres">
          <a href={'#/' + plPath('chart', '')} className="genre" style={{ background: 'hsl(141 60% 30%)' }}>Éxitos del momento</a>
          {STYLES.map((g) => (
            <a key={g} href={'#/style/' + encodeURIComponent(g)} className="genre" style={{ background: `hsl(${hueOf(g)} 60% 38%)` }}>{GENRE_LABEL[g] || g}</a>
          ))}
        </div>
      </div>
    )
  }
  const d = st.data
  const all = filter === 'all'
  const ctx = { type: 'search', id: q, name: `Búsqueda: ${q}` }
  const nothing = d && (all ? !d.tracks.length && !d.artists.length && !d.albums.length && !d.pls.length : !d[filter].length)
  const what = { all: 'resultados', tracks: 'canciones', artists: 'artistas', albums: 'álbumes' }[filter]
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
          {all && d.top && (
            <div className="top-grid">
              <Section title="Resultado principal">
                <TopResult top={d.top} onPlayTrack={() => playList(d.tracks, Math.max(0, d.tracks.indexOf(d.top.item)), ctx)} />
              </Section>
              {d.tracks.length > 0 && (
                <Section title="Canciones" more={{ label: 'Mostrar todo', onClick: () => setFilter('tracks') }}>
                  <TrackList tracks={d.tracks} limit={4} context={ctx} header={false} />
                </Section>
              )}
            </div>
          )}
          {filter === 'tracks' && d.tracks.length > 0 && <TrackList tracks={d.tracks} context={ctx} showAlbum />}
          {(all || filter === 'artists') && d.artists.length > 0 && (
            <Section title={all ? 'Artistas' : ''}><div className={all ? 'shelf' : 'grid'}>{d.artists.map((u) => <ArtistCard key={u.id} artist={u} />)}</div></Section>
          )}
          {(all || filter === 'albums') && d.albums.length > 0 && (
            <Section title={all ? 'Álbumes' : ''}><div className={all ? 'shelf' : 'grid'}>{d.albums.map((p) => <ContextCard key={p.type + p.id} item={p} />)}</div></Section>
          )}
          {all && d.pls.length > 0 && (
            <Section title="Playlists"><div className="shelf">{d.pls.map((p) => <ContextCard key={p.id} item={p} />)}</div></Section>
          )}
        </>
      )}
    </div>
  )
}

// Ficha de artista: del catálogo (cat:), de Audius o, si solo se conoce el nombre, la que corresponda
export function Artist({ id }) {
  if (id.startsWith('cat:')) return <CatArtist key={id} n={id.slice(4)} />
  if (id.startsWith('yt:') || id.startsWith('name:')) return <NamedArtist key={id} name={id.slice(id.indexOf(':') + 1)} />
  return <SourceArtist key={id} id={id} load={() => Promise.all([audius.user(id), audius.userTracks(id, 50)])} />
}

function NamedArtist({ name }) {
  const st = useAsync(() => catalog.artistByName(name).catch(() => null), [name])
  if (st.loading) return <div className="view"><Spinner /></div>
  if (st.data) return <CatArtist n={st.data.id.slice(4)} />
  return <SourceArtist id={'name:' + name} load={() => youtube.searchTracks(name, 12).then((t) => [{ name, cover: t[0]?.cover, external: true }, t])} />
}

function ArtistHead({ a, sub, active, playing, onPlay, children }) {
  return (
    <>
      <div className="pl-head" style={{ '--h': hueOf(a.name) }}>
        <Cover round src={a.cover} alt={`Foto de ${a.name}`} seed={a.name} className="pl-cover" />
        <div className="pl-info">
          <span className="pl-kind">{a.verified ? 'Artista verificado' : 'Artista'}</span>
          <h1 className={cx(a.name.length > 28 && 'long')}>{a.name}</h1>
          {sub && <p className="pl-meta">{sub}</p>}
        </div>
      </div>
      <div className="pl-actions">
        <PlayFab playing={active && playing} onClick={onPlay} />
        {children}
      </div>
    </>
  )
}

function useArtistPlayback(id) {
  const active = usePlayer((s) => s.context?.type === 'artist' && s.context?.id === id)
  const playing = usePlayer((s) => s.isPlaying)
  const toggle = usePlayer((s) => s.toggle)
  const playList = usePlayer((s) => s.playList)
  return { active, playing, toggle, playList }
}

function SourceArtist({ id, load }) {
  const st = useAsync(load, [id])
  const { active, playing, toggle, playList } = useArtistPlayback(id)
  if (st.loading) return <div className="view"><Spinner /></div>
  if (st.error) return <div className="view"><Empty icon="alert" title="No se pudo cargar el artista">Inténtalo de nuevo.</Empty></div>
  const [u, tracks] = st.data
  const ctx = { type: 'artist', id, name: u.name, cover: u.cover }
  return (
    <div className="view pl">
      <ArtistHead a={u} sub={!u.external && `${(u.followers || 0).toLocaleString('es-ES')} seguidores`} active={active} playing={playing}
        onPlay={() => (active ? toggle() : playList(tracks, 0, ctx))} />
      {tracks.length ? <Section title="Populares"><TrackList tracks={tracks} context={ctx} header={false} /></Section>
        : <Empty title="Este artista aún no tiene canciones" />}
    </div>
  )
}

function CatArtist({ n }) {
  const id = 'cat:' + n
  const st = useAsync(async () => {
    const a = await catalog.artist(n)
    const [top, albums, related] = await Promise.all([
      catalog.artistTop(n, 20), catalog.artistAlbums(n, a.name).catch(() => []), catalog.related(n).catch(() => []),
    ])
    return { a, top, albums, related }
  }, [n])
  const { active, playing, toggle, playList } = useArtistPlayback(id)
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState({})
  if (st.loading) return <div className="view"><Spinner /></div>
  if (st.error) return <div className="view"><Empty icon="alert" title="No se pudo cargar el artista">Inténtalo de nuevo.</Empty></div>
  const { a, top, albums, related } = st.data
  const ctx = { type: 'artist', id, name: a.name, cover: a.cover }
  // Discografía sin ediciones repetidas, de lo más nuevo a lo más antiguo
  const seen = new Set()
  const disc = albums.filter((x) => { const k = norm(x.name) + x.record; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((x, y) => String(y.year).localeCompare(String(x.year))).map((x) => ({ ...x, owner: [x.year, x.kind].filter(Boolean).join(' • ') }))
  const groups = [['Álbumes', disc.filter((x) => x.record === 'album')], ['Sencillos y EP', disc.filter((x) => x.record !== 'album')]]
  return (
    <div className="view pl">
      <ArtistHead a={a} sub={a.fans ? `${a.fans.toLocaleString('es-ES')} seguidores` : ''} active={active} playing={playing}
        onPlay={() => (active ? toggle() : playList(top, 0, ctx))}>
        <a className="btn ghost" href={'#/' + plPath('radio', n)}><Icon name="sync" size={16} /> Radio</a>
      </ArtistHead>
      {top.length ? (
        <Section title="Populares">
          <TrackList tracks={top} limit={more ? 10 : 5} context={ctx} header={false} />
          {top.length > 5 && <button className="link more-btn" onClick={() => setMore(!more)}>{more ? 'Ver menos' : 'Ver más'}</button>}
        </Section>
      ) : <Empty title="Este artista aún no tiene canciones" />}
      {groups.map(([title, list]) => list.length > 0 && (
        <Section key={title} title={title} more={list.length > 5 ? { label: open[title] ? 'Mostrar menos' : 'Mostrar todo', onClick: () => setOpen({ ...open, [title]: !open[title] }) } : undefined}>
          <div className={open[title] ? 'grid' : 'shelf'}>{list.map((p) => <ContextCard key={p.id} item={p} />)}</div>
        </Section>
      ))}
      {related.length > 0 && (
        <Section title="Los fans también escuchan"><div className="shelf">{related.map((u) => <ArtistCard key={u.id} artist={u} />)}</div></Section>
      )}
    </div>
  )
}
