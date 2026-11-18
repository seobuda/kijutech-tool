#!/usr/bin/env bash
# Reconstruye la imagen de la app en el servidor con MENOS PRIORIDAD que la app en marcha (18 nov 2026).
# Lo llama scripts/deploy.sh. El servidor tiene 1 CPU: compilar (≈6 min) dejaba la app tan lenta que Telegram
# entregaba un aviso sin responder a tiempo y el reintento llegaba duplicado (le pasó a Mayi).
#
# Cómo: los pasos de la construcción los lanza el demonio de Docker (dockerd/containerd). Mientras se construye, sus
# hilos van con prioridad baja de CPU (nice 15) y de disco; lo que lancen hereda esa prioridad. La app ya en marcha
# corre bajo su propio proceso (containerd-shim), arrancado antes, y no cambia. Al terminar (también si falla o se corta)
# se devuelve la prioridad normal, ANTES de que deploy.sh arranque la app nueva: así la app nueva no hereda nada.
# deploy.sh comprueba después que la app tenga prioridad 0.
set -uo pipefail
cd /opt/kijutech

set_priority() { # $1 = nice (0 normal, 15 baja); $2 = clase de ionice (0 = la normal, 2 + nivel 7 = baja)
  for pid in $(pidof dockerd containerd 2>/dev/null); do
    for task in /proc/"$pid"/task/*; do
      tid="${task##*/}"
      renice -n "$1" -p "$tid" >/dev/null 2>&1 || true
      if [[ "$2" == "0" ]]; then ionice -c 0 -p "$tid" >/dev/null 2>&1 || true; else ionice -c 2 -n 7 -p "$tid" >/dev/null 2>&1 || true; fi
    done
  done
}

set_priority 15 2
trap 'set_priority 0 0' EXIT HUP INT TERM

docker compose -f docker-compose.prod.yml build app > /tmp/kiju-build.log 2>&1
rc=$?
grep -E 'rror|Built' /tmp/kiju-build.log | tail -8
exit $rc
