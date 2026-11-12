// Cliente de la mini-API de usuarios (lo único que vive en nuestro servidor)
const URL_API = import.meta.env.BASE_URL + 'api/users.php'

async function call(method, params, body) {
  const qs = params ? '?' + new URLSearchParams(params) : ''
  let r
  try {
    r = await fetch(URL_API + qs, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch { throw new Error('No hay conexión con el servidor') }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(j.error || 'Error del servidor'); e.status = r.status; throw e }
  return j
}

export const api = {
  search: (q) => call('GET', { a: 'search', q }),
  register: (name, animal, web = '') => call('POST', null, { a: 'register', name, animal, web }),
  login: (name, animal) => call('POST', null, { a: 'login', name, animal }),
  logout: (s) => call('POST', null, { a: 'logout', name: s.name, token: s.token }),
  getLib: (s) => call('POST', null, { a: 'getlib', name: s.name, token: s.token }),
  setLib: (s, library) => call('POST', null, { a: 'setlib', name: s.name, token: s.token, library }),
  visit: (hit) => call('GET', { a: 'visit', hit: hit ? '1' : '0' }),
}

export const ANIMALS = [
  ['perro', '🐶'], ['gato', '🐱'], ['zorro', '🦊'], ['oso', '🐻'], ['panda', '🐼'], ['koala', '🐨'],
  ['tigre', '🐯'], ['leon', '🦁'], ['vaca', '🐮'], ['cerdo', '🐷'], ['rana', '🐸'], ['mono', '🐵'],
  ['pollito', '🐥'], ['pinguino', '🐧'], ['buho', '🦉'], ['unicornio', '🦄'], ['abeja', '🐝'], ['mariposa', '🦋'],
  ['tortuga', '🐢'], ['pulpo', '🐙'], ['delfin', '🐬'], ['ballena', '🐳'], ['tiburon', '🦈'], ['dinosaurio', '🦖'],
]
