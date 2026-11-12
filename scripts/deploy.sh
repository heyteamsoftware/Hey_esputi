#!/usr/bin/env bash
# Despliega dist/ en /var/www/html/esputi. No toca esputi/data (usuarios) ni otras carpetas del servidor.
# Uso: ESPUTI_KEY=/ruta/a/la/clave.key bash scripts/deploy.sh
# Copia de pruebas: ESPUTI_DIR=esputi2 ESPUTI_KEY=... bash scripts/deploy.sh
#   → https://myappsserver.duckdns.org/esputi2/, con sus propios usuarios y sin indexar
set -euo pipefail
KEY="${ESPUTI_KEY:?Indica la clave SSH en ESPUTI_KEY}"
DIR="${ESPUTI_DIR:-esputi}"
case "$DIR" in esputi|esputi2) ;; *) echo "Carpeta no permitida: $DIR" >&2; exit 1 ;; esac
HOST="ubuntu@129.151.249.242"
DEST="/var/www/html/$DIR"
ESPUTI_DIR="$DIR" npm run build

if [ "$DIR" != esputi ]; then
  # Las páginas estáticas y la configuración del servidor apuntan a /esputi/: se cambian a la copia
  find dist -type f \( -name '*.html' -o -name '*.webmanifest' -o -name '*.txt' -o -name '*.xml' -o -name '.htaccess' -o -name '*.php' \) \
    -exec sed -i "s#/esputi/#/$DIR/#g; s#esputi_admin#${DIR}_admin#g" {} +
  # Copia de pruebas: que no salga en buscadores y que se vea que es la de pruebas
  sed -i 's#<head>#<head><meta name="robots" content="noindex, nofollow">#' dist/index.html
  sed -i "s#\"name\": \"Esputi\"#\"name\": \"Esputi (pruebas)\"#; s#\"short_name\": \"Esputi\"#\"short_name\": \"Esputi 2\"#" dist/manifest.webmanifest
fi

ssh -i "$KEY" "$HOST" "mkdir -p $DEST/data && rm -rf $DEST/assets"
tar -C dist --exclude=./data -czf - . | ssh -i "$KEY" "$HOST" "tar -xzf - -C $DEST --no-same-owner --no-same-permissions"
scp -q -i "$KEY" dist/data/.htaccess "$HOST:$DEST/data/.htaccess"
# La copia de pruebas usa la misma contraseña de administración (solo su hash), sin copiar usuarios
if [ "$DIR" != esputi ]; then
  ssh -i "$KEY" "$HOST" "[ -f $DEST/data/admin.json.php ] || cp /var/www/html/esputi/data/admin.json.php $DEST/data/admin.json.php"
fi
ssh -i "$KEY" "$HOST" "chgrp -R www-data $DEST && chmod -R g+rX,o+rX $DEST && chmod 2770 $DEST/data && chmod 660 $DEST/data/* $DEST/data/.htaccess 2>/dev/null; ls -la $DEST $DEST/data"
