// Ajustes del navegador (no se envían al servidor)
import { store } from './util'

let settings = { spotifyClientId: '', ytKey: '', ...store.get('esputi.settings', {}) }
let defaults = {}

export const getSettings = () => ({ ...settings, spotifyClientId: settings.spotifyClientId || defaults.spotifyClientId || '' })
export const saveSettings = (patch) => { settings = { ...settings, ...patch }; store.set('esputi.settings', settings) }

// config.json permite al administrador fijar un Client ID de Spotify para todos
export const loadDefaults = async () => {
  try { defaults = await (await fetch(import.meta.env.BASE_URL + 'config.json', { cache: 'no-cache' })).json() } catch { defaults = {} }
}
