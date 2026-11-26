# Autonomía de Claude y piezas de ECC
**Fecha:** 2026-11-26  
**Rama:** chore/ecc-adopcion  
**Commit:** 0e463869

## Qué se construyó
- **`docs/auditoria-ecc.md`:** auditoría de solo lectura de ECC (Everything Claude Code, commit 4adeee67). Veredicto
  cherry-pick mínimo: inventario, matriz, Top 5 de seguridad, piezas adoptadas y descartadas, y plan por pasos.
- **`CLAUDE.md`:**
  - «Reglas de autonomía» reescrita. Claude trabaja sin preguntar dentro del trabajo acordado:
    - código y migraciones aditivas;
    - desplegar por tandas, también con `--migrate`.

    Líneas rojas:
    - migraciones destructivas;
    - efectos hacia fuera con clientes o dinero;
    - login;
    - borrar datos reales;
    - Docker y dependencias.
  - «Decisiones de diseño» pasa a ser un protocolo: 3 puntos de vista expertos, 3 alternativas, auditoría independiente con
    Opus 5.5 en esfuerzo alto y revisor de código.
- **`.claude/agents/revisor-codigo.md`:** revisor del diff antes de fusionar. Criterio de ECC (umbral de confianza, cuatro
  preguntas, prueba en los graves) con las reglas del proyecto.
- **`.claude/settings.json`:**
  - el cambio de Enric: `deploy.sh --migrate` y `db:migrate` ya no preguntan;
  - reglas `deny` nuevas.
- **`tests/cadena-suministro.test.ts`:** falla si CLAUDE.md, `.claude/`, `docs/` o los prompts llevan caracteres
  invisibles, bidi o etiquetas Unicode.
- **`docs/CHECKLIST-AUDITORIA-AGENTES.md`:** las 12 capas para auditar los agentes de producción.
- **`scripts/deploy.sh`:** solo comentarios y mensajes sobre `--migrate`.
- **`docs/ESTADO.md`:** §6.43, cronología y pendientes.
- **Pruebas y Mapa Visual:** 54 ficheros y 693 pruebas pasan. El Mapa Visual no cambia (no hay procesos nuevos) y su
  comprobación pasa.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **No instalar ECC.** Solo se adaptan ideas a ficheros propios versionados: unos 80 tokens fijos frente a más de 40 000.
- **El revisor se probó sobre esta misma rama** (con un agente general, porque los agentes nuevos solo se cargan al empezar
  sesión). Encontró, y se corrigió:
  - `CLAUDE.md` daba a entender que `deploy.sh --migrate` vuelve atrás solo, y no es así: se aclaró;
  - faltaba recordar el backup local antes de migrar un módulo nuevo;
  - la prueba de Unicode llevaba los caracteres escritos tal cual, porque la herramienta de escritura convirtió los escapes
    `\u`: ahora va por códigos numéricos y cubre también las etiquetas Unicode.
- **El clasificador de auto mode bloqueó que Claude quitara o acotara reglas de sus propios permisos.** Era correcto: esos
  cambios quedan para Enric (ver «Pendientes»).

## Qué verificar manualmente
- En una sesión nueva:
  - `/agents` muestra `revisor-codigo`;
  - `/context`, para tener la cifra real de arranque.
- Que `bash scripts/deploy.sh` y `server-status.sh` sigan funcionando con las reglas `deny`. Usan `ssh` por dentro y las
  reglas solo miran el comando que escribe Claude.

## Pendientes detectados
- **Permisos (Enric):**
  - las reglas `deny` de `curl|sh` probablemente no saltan, porque cada tramo del comando se evalúa por separado. Mejor
    `ask` en `Bash(sh)`, `Bash(sh *)`, `Bash(bash)` y `Bash(bash -c*)`;
  - acotar `Bash(*ANTHROPIC_BASE_URL*)`;
  - quitar `Edit(lib/db/schema.ts)` y `Edit(lib/db/migrations/**)` de `ask` si se quiere autonomía completa.
- **Seguridad de producción (Top 5 de la auditoría):**
  - tope de gasto que corte;
  - texto ajeno con un tratamiento común y batería de inyección;
  - candados de autonomía;
  - quitar el `'dev'` del HMAC de OAuth.
