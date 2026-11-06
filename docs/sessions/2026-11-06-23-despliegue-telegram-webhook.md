# Despliegue: primer acceso, tokens y Telegram por webhook
**Fecha:** 2026-11-06  
**Rama:** feature/despliegue  
**Commit:** 0f11c57a

## Qué se construyó
- `lib/architecture-map/registry.ts`: el nodo «Servidor» del Mapa Visual refleja que Telegram ya recibe por webhook y que Cloudflare queda para más adelante.
- `docs/ESTADO.md`: cabecera (fecha), Telegram (§6), pendientes (§16), hoja de ruta (§17) y cronología (§18).
- Sin cambios de código de aplicación: el resto fueron operaciones en producción (`brain.kijutech.com`), sin archivos nuevos en el repo salvo este documento.

**En el servidor (`kijutech-brain`):**
- Se desbloqueó el inicio de sesión de `enrique@kijutech.com`: 5 fallos propios (misma IP, mismo correo) en `auth_login_attempts` lo tenían bloqueado 15 min. Se borraron esas 5 filas (`delete … where email=… and succeeded=false`).
- Enric entró y cambió la contraseña inicial desde Dashboard → Seguridad. Se borró `/opt/kijutech/admin-initial-password.txt` con `shred -u`. La contraseña inicial se mostró en el chat a petición de Enric, por lo que ya no vale.
- Enric introdujo en el panel los tokens de ClickUp, Telegram e IA. Bot **@KijutechPMBot**, modo pruebas activo, recibiendo por polling; se envió una prueba y llegó.
- Webhook activado desde Ajustes → Telegram con la base `https://brain.kijutech.com`. Verificado: `ops_telegram_config.receive_mode = webhook`, sin `last_error`; `getWebhookInfo` sin errores ni pendientes (IP 207.154.216.13); la ruta devuelve 403 sin el secreto; `/ayuda` responde desde el móvil.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Diagnóstico del webhook con un script temporal** (`getWebhookInfo`) ejecutado dentro de `kijutech_app` con `docker exec -i … node -`: descifra el token con `AI_ENCRYPTION_KEY` y llama a Telegram sin imprimir el token (la URL sale con el tenant tapado). El script no se versionó ni se dejó en el servidor.
- **No activé el webhook yo mismo:** es una acción de administrador del panel que necesita la sesión de Enric; prefería no manejar el token del bot. Lo pulsó Enric.
- **«Hola» sin respuesta no era un fallo:** el bot ignora texto suelto y solo atiende comandos (`/ayuda`, `/sugerencia`…) y respuestas esperadas; se comprobó con `/ayuda`.
- **Cloudflare (proxy, SSL Full strict) aparcado** por decisión de Enric: no hace falta ahora.
- Se actualizó el nodo del Mapa Visual y ESTADO.md. El Mapa Visual se actualizó y `node scripts/check-architecture-map.js` pasó (13 automatizaciones, 7 tareas, 6 prompts, 33 tablas, 77 pasos en 13 mapas). No se ejecutó `pnpm test`: solo cambió un texto del nodo «Servidor» y documentación, y el Docker local está parado.

## Qué verificar manualmente
- Entrar en `https://brain.kijutech.com` con la contraseña nueva y recorrer Bloc de notas, Equipo hoy y Encargos con los tokens ya puestos.
- En Ajustes → Telegram debe verse «Webhook activo».
- Mandar `/ayuda` a @KijutechPMBot y pulsar un botón de un aviso real cuando llegue.
- Cuando se despliegue la próxima versión, comprobar que el mapa muestra el nodo «Servidor» actualizado.

## Pendientes detectados
- **Copias fuera de DigitalOcean** (NAS y Google Drive de la agencia): hoy el dump diario y los snapshots están solo en el droplet y en DO.
- CSP con nonce.
- Apagar el modo pruebas de Telegram cuando el equipo haya vinculado su chat.
- Proxy de Cloudflare (SSL Full strict), cuando se quiera.
- Caddy no registra accesos: para diagnosticar problemas de red conviene activar el log de acceso.
- Decidir el `git push` de `feature/despliegue` y su fusión a `main` (el push se confirma con Enric).
- La ruta `/api/telegram/webhook` responde 500 si `t` no es un UUID (la consulta a la BD falla). Inofensivo, pero devolver 404 sería más limpio.
