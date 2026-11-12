export const fmtTime = (s) => {
  if (!s || !isFinite(s)) return '0:00'
  s = Math.floor(s)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

export const fmtTotal = (s) => {
  if (!s) return ''
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

// Normaliza texto para comparar "Artista - Título" entre servicios
export const norm = (s = '') =>
  String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(feat|ft|featuring)\b\.?.*$/g, ' ')
    .replace(/-\s*(remaster(ed)?|radio edit|single version|album version|mono|stereo|live|bonus track)\b.*$/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const cx = (...a) => a.filter(Boolean).join(' ')

// La copia de pruebas (/esputi2/) comparte dominio con la buena: sus datos del navegador
// llevan un prefijo para no mezclarse (sesión, ajustes, cuenta de Spotify…)
const NS = import.meta.env.BASE_URL === '/esputi/' ? '' : import.meta.env.BASE_URL.replace(/\//g, '') + ':'
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(NS + k); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)) } catch { /* lleno o bloqueado */ } },
  del(k) { try { localStorage.removeItem(NS + k) } catch { /* nada */ } },
}

export const decodeHtml = (s = '') => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value }

export const ago = (ts) => {
  if (!ts) return 'nunca'
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `hace ${Math.floor(s / 86400)} d`
}

// Color estable a partir de un texto (portadas sin imagen, tarjetas de género)
export const hueOf = (s = '') => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h }

// Ejecuta tareas con concurrencia limitada
export async function pool(items, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k) }
  }))
}
