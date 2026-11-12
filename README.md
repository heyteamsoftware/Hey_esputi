# Esputi

Reproductor web de música de fuentes abiertas con interfaz tipo Spotify y sincronización en vivo de playlists de Spotify.

**En producción:** https://myappsserver.duckdns.org/esputi/ · **Administración:** https://myappsserver.duckdns.org/esputi/admin/

## Qué hace

- **Música 100 % en streaming desde fuentes públicas**; el servidor nunca guarda audio.
  - **Audius** (principal) e **Internet Archive**: sin configuración y funcionan con la pantalla del móvil apagada.
  - **YouTube** (reproductor oficial incrustado): se busca automáticamente a través de `api/yt.php`. No suena con la pantalla del móvil apagada.
- **Reproductor completo**: cola, play/pausa, anterior/siguiente, aleatorio, repetir, volumen, controles en la pantalla de bloqueo.
- **Spotify Live Sync**: se pega el enlace de una playlist pública y basta. Se leen sus datos públicos (nombre, canciones, artistas),
  se empareja cada canción (Artista – Título) con las fuentes abiertas y se vuelve a comprobar periódicamente: si cambia en Spotify,
  aquí se actualiza sola. Las canciones sin coincidencia fiable salen en gris. Opcionalmente se puede conectar la cuenta
  (API oficial con PKCE y `snapshot_id`) para playlists privadas o de más de 100 canciones.
- **Usuarios**: nombre + animal (el animal es la contraseña). Las listas y favoritos se guardan en el servidor como texto.
- **Panel de administración** para ver y borrar usuarios.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/lib/sources/` | Audius, Internet Archive y YouTube |
| `src/lib/engine.js` | Motor de audio (`<audio>` + IFrame de YouTube) |
| `src/lib/matcher.js` | Mapeo Spotify → fuente abierta, con caché |
| `src/lib/spotify.js`, `src/lib/sync.js` | API de Spotify (PKCE) y sincronización por `snapshot_id` |
| `src/store/` | Estado con Zustand: reproductor, biblioteca e interfaz |
| `src/components/`, `src/views/` | Interfaz (React) |
| `public/api/spotify.php` | Lectura de los datos públicos de una playlist (no guarda nada) |
| `public/api/yt.php` | Búsqueda de vídeos en YouTube (no guarda nada) |
| `public/api/users.php` | API de usuarios y bibliotecas (JSON en `data/`) |
| `public/api/admin.php`, `public/admin/` | Panel de administración |

## Desarrollo

```bash
npm install
npm run dev      # http://127.0.0.1:5173/esputi/ (la API se pide al servidor real)
npm run build
```

## Despliegue

```bash
ESPUTI_KEY=/ruta/a/la/clave.key bash scripts/deploy.sh
```

Sube `dist/` a `/var/www/html/esputi` sin tocar `esputi/data` (usuarios y bibliotecas).

La contraseña de administración no está en el código: su hash vive en `data/admin.json.php`. Para cambiarla, en el servidor:

```bash
cd /var/www/html/esputi/data && php -r '$p=trim(fgets(STDIN)); file_put_contents("admin.json.php","<?php exit; ?>\n".json_encode(["hash"=>password_hash($p,PASSWORD_DEFAULT)]));'
```

## Conectar una cuenta de Spotify (opcional)

No hace falta para playlists públicas. Solo para privadas o de más de 100 canciones:

1. Crear una app en <https://developer.spotify.com/dashboard> (API: «Web API»).
2. Añadir la Redirect URI `https://myappsserver.duckdns.org/esputi/` (en local: `http://127.0.0.1:5173/esputi/`).
3. Poner el **Client ID** en `public/config.json` (`spotifyClientId`) para todos los usuarios, o cada usuario en Ajustes.

Mientras la app de Spotify esté en «modo desarrollo» solo podrán conectarse las cuentas que añadas en su panel, y Spotify
solo deja leer playlists propias o colaborativas de quien se conecta.

## YouTube

La búsqueda en YouTube pasa por `public/api/yt.php`, que lee la página pública de resultados (sin clave y sin guardar nada).
No es una API oficial: si YouTube cambia su página o limita al servidor, dejará de encontrar vídeos hasta que se actualice.
Como alternativa oficial, cada usuario puede poner su clave de YouTube Data API v3 en Ajustes (unas 100 búsquedas al día gratis).

## Aviso

Proyecto educativo sin relación con Spotify AB, Audius, Internet Archive ni Google.
