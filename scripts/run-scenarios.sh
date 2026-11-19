#!/usr/bin/env bash
# Lanza las pruebas simuladas (Sistema → Pruebas) y muestra el resultado (19 nov 2026).
#
#   bash scripts/run-scenarios.sh                 todas, en PRODUCCIÓN (cuenta de pruebas aislada)
#   bash scripts/run-scenarios.sh clave1 clave2   solo esas
#   bash scripts/run-scenarios.sh --local [...]   en el contenedor local
#   bash scripts/run-scenarios.sh --despliegue <commit>   las de después de desplegar (las lanza deploy.sh)
#
# «Todas» son las internas: clickup-real (ClickUp de verdad, lista «Pruebas Kiju») solo corre si se nombra.
#
# Llama a /api/pruebas/run desde dentro del contenedor de la app, con el secreto derivado de AUTH_SECRET (que nunca sale
# del contenedor). Todo lo simulado vive en la cuenta de pruebas: nada sale a Telegram, ClickUp ni a la IA.
# Sale con código 1 si alguna prueba falla.
set -uo pipefail

LOCAL=0
EXTRA=""
if [[ "${1:-}" == "--local" ]]; then LOCAL=1; shift; fi
if [[ "${1:-}" == "--despliegue" ]]; then
  [[ "${2:-}" =~ ^[0-9a-f]{4,40}$ ]] || { echo "✗ --despliegue necesita el commit" >&2; exit 2; }
  EXTRA=",\"trigger\":\"despliegue\",\"commit\":\"$2\""
  shift 2
fi
KEYS="$*"

# JSON del cuerpo (claves solo con letras, números y guiones; el commit, solo hexadecimal).
BODY="{\"v\":1$EXTRA}"
if [[ -n "$KEYS" ]]; then
  for k in $KEYS; do [[ "$k" =~ ^[a-z0-9-]+$ ]] || { echo "✗ Clave no válida: $k" >&2; exit 2; }; done
  BODY="{\"scenarios\":[\"$(echo $KEYS | sed 's/ /","/g')\"]$EXTRA}"
fi

NODE_SCRIPT='
const c = require("crypto");
const s = c.createHmac("sha256", process.env.AUTH_SECRET).update("kiju-pruebas-simuladas").digest("hex");
fetch("http://127.0.0.1:3000/api/pruebas/run", { method: "POST", headers: { "x-kiju-pruebas": s, "content-type": "application/json" }, body: process.env.KIJU_BODY || "{}" })
  .then(async (r) => {
    const j = await r.json().catch(() => null);
    if (!j) { console.log("✗ Respuesta no válida (" + r.status + ")"); process.exit(1); }
    if (j.error) console.log("✗ " + j.error);
    for (const x of j.results || []) console.log((x.status === "ok" ? "  ✓ " : "  ✗ ") + x.key + " — " + x.title + (x.error ? "\n      " + x.error : ""));
    const n = (j.results || []).length, f = (j.results || []).filter((x) => x.status !== "ok").length;
    console.log(f ? "✗ " + f + " de " + n + " fallan" : "✓ " + n + " de " + n + " correctas");
    process.exit(j.ok ? 0 : 1);
  })
  .catch((e) => { console.log("✗ " + e.message); process.exit(1); });
'

# El script va por la entrada estándar (node -) y las claves en una variable: sin comillas anidadas por SSH.
if [[ $LOCAL -eq 1 ]]; then
  printf '%s' "$NODE_SCRIPT" | docker exec -i -e KIJU_BODY="$BODY" kijutech_app node -
else
  printf '%s' "$NODE_SCRIPT" | ssh -i "$HOME/.ssh/kijutech_brain" -o BatchMode=yes root@207.154.216.13 "docker exec -i -e KIJU_BODY='$BODY' kijutech_app node -"
fi
