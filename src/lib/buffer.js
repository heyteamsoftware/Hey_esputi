// Buffer local. Las canciones de las fuentes abiertas (Audius e Internet Archive, que
// permiten bajar el audio) se descargan enteras al móvil: la que suena y las dos siguientes,
// por ese orden. Así el cambio de canción es inmediato y la música no se corta si se pierde
// la cobertura. Lo ya escuchado o saltado se borra en cuanto sale de esa ventana de tres.
// Vive solo en la memoria del navegador: nunca pasa por nuestro servidor ni se guarda.
import { streamUrl } from './sources/audius'
import { archive } from './sources/archive'

const MAX_BYTES = 40 * 1024 * 1024 // conciertos enteros y similares se quedan en directo
const items = new Map()            // id → { state: 'loading' | 'ready' | 'failed', url, size, ctrl }
let wanted = []                    // pistas que se quieren tener, la primera es la más urgente
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

export const bufferable = (t) => !!t && (t.source === 'audius' || t.source === 'archive')
const remote = async (t) => (t.source === 'archive' ? archive.resolve(t.sid) : streamUrl(t.sid))

function drop(id) {
  const it = items.get(id)
  if (!it) return
  it.ctrl?.abort()
  if (it.url) URL.revokeObjectURL(it.url)
  items.delete(id)
}

async function download(t) {
  const it = { state: 'loading', ctrl: new AbortController(), url: null, size: 0 }
  items.set(t.id, it)
  try {
    const r = await fetch(await remote(t), { signal: it.ctrl.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    if ((+r.headers.get('content-length') || 0) > MAX_BYTES) { it.ctrl.abort(); throw new Error('Demasiado grande') }
    const blob = await r.blob()
    if (items.get(t.id) !== it) return // se descartó mientras bajaba
    it.size = blob.size
    it.url = URL.createObjectURL(blob)
    it.state = 'ready'
  } catch {
    if (items.get(t.id) === it) it.state = 'failed'
  } finally {
    if (items.get(t.id) === it) it.ctrl = null
    pump()
  }
}

// Una descarga cada vez, por orden de prioridad
function pump() {
  if (![...items.values()].some((i) => i.state === 'loading')) {
    const next = wanted.find((t) => !items.has(t.id))
    if (next) download(next)
  }
  notify()
}

// Las que fallaron (sin cobertura en ese momento) se vuelven a intentar
function retry() {
  for (const [id, it] of [...items]) if (it.state === 'failed') items.delete(id)
  pump()
}
if (typeof window !== 'undefined') window.addEventListener('online', retry)

export const buffer = {
  // Pistas (ya resueltas) que hay que tener en local, por orden. Todo lo demás se borra.
  want(tracks) {
    wanted = tracks.filter(bufferable)
    const keep = new Set(wanted.map((t) => t.id))
    for (const id of [...items.keys()]) if (!keep.has(id)) drop(id)
    retry()
  },
  // Dirección local de una pista si ya está descargada entera
  url: (id) => (items.get(id)?.state === 'ready' ? items.get(id).url : null),
  has: (id) => items.get(id)?.state === 'ready',
  // Cuántas hay listas y cuánto ocupan
  stats: () => {
    const ready = [...items.values()].filter((i) => i.state === 'ready')
    return { count: ready.length, bytes: ready.reduce((n, i) => n + i.size, 0) }
  },
  clear() { wanted = []; for (const id of [...items.keys()]) drop(id); notify() },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn) },
}
