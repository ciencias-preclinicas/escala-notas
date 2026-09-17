#!/bin/sh
# Sube en uno la versión (?v=N) de todos los estilos y scripts enlazados en index.html.
# Hay que ejecutarlo cada vez que se modifica un archivo de css/ o js/, para que ningún
# navegador combine el HTML nuevo con código antiguo guardado en caché.
#
#   sh bin/subir-version.sh
set -e
cd "$(dirname "$0")/.."

actual=$(grep -o '?v=[0-9]\+' index.html | head -1 | cut -d= -f2)
if [ -z "$actual" ]; then
  echo "No se encontró ninguna marca ?v= en index.html" >&2
  exit 1
fi
nueva=$((actual + 1))

sed -i '' "s/?v=$actual\"/?v=$nueva\"/g" index.html
sed -i '' "s/(\`?v=$actual\`)/(\`?v=$nueva\`)/" README.md 2>/dev/null || true

echo "Versión $actual → $nueva en $(grep -c "?v=$nueva" index.html) referencias de index.html"
