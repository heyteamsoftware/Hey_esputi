// Listas "imprescindibles" de cada estilo: los grupos famosos de verdad, elegidos a mano
// (scripts/legends.mjs las genera). La portada las usa en "Porque te gusta…" para que
// quien dice que le gusta el rock vea a Queen o AC/DC y no grupos que nadie conoce.
import INDEX from './legends.json'
import { catTrack } from './catalog'

const pic = (hash, n) => (hash ? `https://cdn-images.dzcdn.net/images/artist/${hash}/${n}x${n}-000000-80-0-0.jpg` : '')
const names = (l) => l.artists.slice(0, 3).map((a) => a[1]).join(', ') + ' y más'
// Portada: mosaico con las fotos de sus cuatro primeros artistas
const covers = (l) => l.artists.filter((a) => a[2]).slice(0, 4).map((a) => pic(a[2], 250))
const card = (l) => ({ type: 'legend', id: l.id, name: l.name, owner: names(l), cover: pic(l.artists[0]?.[2], 500), covers: covers(l) })
const find = (id) => Object.values(INDEX).flatMap((g) => g.lists).find((l) => l.id === id)

export const hasLegends = (genre) => !!INDEX[genre]
// "Porque te gusta el rock", "…la música latina"
export const because = (genre) => INDEX[genre]?.because || genre
export const legendLists = (genre) => (INDEX[genre]?.lists || []).map(card)
// La lista principal de cada estilo (para "Listas imprescindibles")
export const mainLegends = (skip = []) => Object.keys(INDEX).filter((g) => !skip.includes(g)).map((g) => card(INDEX[g].lists[0]))

// Artistas famosos del estilo, alternando sus listas (internacional y en español)
export function legendArtists(genre, max = 8) {
  const lists = INDEX[genre]?.lists || [], out = [], seen = new Set()
  for (let i = 0; out.length < max && i < 12; i++) {
    for (const l of lists) {
      const a = l.artists[i]
      if (a && !seen.has(a[0]) && out.length < max) { seen.add(a[0]); out.push({ id: 'cat:' + a[0], name: a[1], cover: pic(a[2], 250), catalog: true }) }
    }
  }
  return out
}

const mem = new Map()
export function legend(id) {
  if (!/^[a-z0-9-]+$/.test(String(id))) return Promise.reject(new Error('Lista desconocida'))
  if (!mem.has(id)) {
    const p = fetch(import.meta.env.BASE_URL + 'legends/' + id + '.json').then((r) => { if (!r.ok) throw new Error('Lista ' + r.status); return r.json() })
      .then((l) => ({
        type: 'legend', id, kind: 'Playlist', name: l.name, owner: 'Esputi', description: l.description, cover: l.cover,
        covers: find(id) ? covers(find(id)) : undefined, tracks: l.tracks.map(catTrack),
      }))
    mem.set(id, p)
    p.catch(() => mem.delete(id))
  }
  return mem.get(id)
}
