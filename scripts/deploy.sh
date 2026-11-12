#!/usr/bin/env bash
# Despliega dist/ en /var/www/html/esputi. No toca esputi/data (usuarios) ni otras carpetas del servidor.
# Uso: ESPUTI_KEY=/ruta/a/la/clave.key bash scripts/deploy.sh
set -euo pipefail
KEY="${ESPUTI_KEY:?Indica la clave SSH en ESPUTI_KEY}"
HOST="ubuntu@129.151.249.242"
DEST="/var/www/html/esputi"
npm run build
ssh -i "$KEY" "$HOST" "mkdir -p $DEST/data && rm -rf $DEST/assets"
tar -C dist --exclude=./data -czf - . | ssh -i "$KEY" "$HOST" "tar -xzf - -C $DEST --no-same-owner --no-same-permissions"
scp -q -i "$KEY" dist/data/.htaccess "$HOST:$DEST/data/.htaccess"
ssh -i "$KEY" "$HOST" "chgrp -R www-data $DEST && chmod -R g+rX,o+rX $DEST && chmod 2770 $DEST/data && chmod 660 $DEST/data/* $DEST/data/.htaccess 2>/dev/null; ls -la $DEST $DEST/data"
