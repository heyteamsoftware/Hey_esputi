import { createRoot } from 'react-dom/client'
import App from './App'
import { loadDefaults } from './lib/settings'
import { handleCallback } from './lib/spotify'
import { toast } from './store/ui'
import './styles.css'

async function boot() {
  await loadDefaults()
  const cb = await handleCallback() // ¿volvemos del inicio de sesión de Spotify?
  createRoot(document.getElementById('root')).render(<App />)
  if (cb?.ok) toast('Spotify conectado')
  else if (cb?.error) toast(cb.error)
}
boot()
