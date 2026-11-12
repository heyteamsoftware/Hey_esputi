import { create } from 'zustand'
import { store } from '../lib/util'

let toastTimer

export const useUI = create((set) => ({
  toast: null,
  menu: null, // { x, y, items: [{ label, onClick, danger } | { sep: true }] }
  panel: store.get('esputi.panel', true), // panel derecho (cola)
  sync: { checking: false, last: 0, error: '' },
  showToast(msg) {
    clearTimeout(toastTimer)
    set({ toast: msg })
    toastTimer = setTimeout(() => set({ toast: null }), 3200)
  },
  openMenu(e, items) {
    e.preventDefault(); e.stopPropagation()
    const r = e.currentTarget?.getBoundingClientRect?.()
    const x = e.clientX || r?.left || 0, y = e.clientY || r?.bottom || 0
    set({ menu: { x, y, items: items.filter(Boolean) } })
  },
  closeMenu: () => set({ menu: null }),
  np: false, // pantalla completa "Reproduciendo" (móvil)
  setNp: (np) => set({ np }),
  togglePanel: () => set((s) => { store.set('esputi.panel', !s.panel); return { panel: !s.panel } }),
  setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),
}))

export const toast = (m) => useUI.getState().showToast(m)

// --- Rutas con hash: #/home, #/search/<q>, #/pl/<tipo>/<id>, #/artist/<id>, #/sync, #/settings, #/library
export const parseRoute = () => {
  const p = location.hash.replace(/^#\/?/, '').split('/')
  const dec = (s) => { try { return decodeURIComponent(s || '') } catch { return s || '' } }
  return { name: p[0] || 'home', a: dec(p[1]), b: dec(p.slice(2).join('/')) }
}
export const nav = (path) => { location.hash = '#/' + path }
export const plPath = (type, id) => (type === 'artist' ? 'artist/' : `pl/${type}/`) + encodeURIComponent(id ?? '')
