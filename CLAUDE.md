# IDIOMA: Responde siempre en español, sin excepciones.

\# CLAUDE.md — kijutech-tool



\## Qué es este proyecto



Herramienta interna de la agencia Kijutech para gestionar proyectos SEO (y en el futuro, otros departamentos) de forma centralizada, sustituyendo ClickUp + Drive + chats sueltos. Fork de `nextjs/saas-starter`. Arquitectura núcleo + módulos, multi-tenant desde el esquema de datos pero single-tenant funcional en esta fase.



Documentación completa de arquitectura, decisiones y roadmap vive en el proyecto de Claude.ai asociado (no en este repo). Si necesitas contexto de diseño que no esté aquí, pregúntale a Enric antes de asumir.



\## Stack (no cambiar sin confirmar con Enric)



\- Next.js 15 App Router + PostgreSQL + Drizzle ORM + shadcn/ui + Tailwind

\- Auth: JWT en cookies httpOnly, ya incluida en el starter — no usar NextAuth ni Clerk

\- Stripe instalado pero \*\*INACTIVO\*\* — no configurar ni activar hasta indicación explícita



\## CRÍTICO — Todo corre dentro de Docker, nunca en Windows directamente



Esta regla cuesta horas de debugging si se rompe. El motivo: en una sesión anterior, ejecutar `pnpm install` en Windows generó binarios nativos de Windows en `node\_modules` que, al mezclarse con el contenedor Linux, colgaban Turbopack silenciosamente sin dar ningún error.



\- \*\*Nunca\*\* ejecutes `pnpm install`, `pnpm add`, ni ningún comando de npm/pnpm en el host Windows

\- Todo comando de dependencias o build se ejecuta con `docker exec -it kijutech\_app <comando>`

\- Para levantar el entorno: `docker compose up -d`

\- Si cambias `Dockerfile.dev` o `package.json`: `docker compose up --build -d`

\- Migraciones: `docker exec -it kijutech\_app pnpm db:migrate`

\- No hay hot-reload — el contenedor corre en modo producción (`pnpm build` + `pnpm start`), no `pnpm dev`. Cada cambio de código requiere reconstruir la imagen.

\- Acceder a la app en el navegador por `http://127.0.0.1:3000` — \*\*nunca `localhost`\*\*, da `ERR\_CONNECTION\_RESET` en esta máquina por un problema de resolución IPv6 en Windows + WSL2 + Docker Desktop.



\## Arquitectura: núcleo vs. módulos



\- El núcleo (`tenants`, `users`, `roles`, `projects`, `modules`) nunca depende de un módulo específico

\- Un módulo (ej. `seo`) nunca es importado directamente por otro módulo — se comunican vía el núcleo como intermediario

\- Toda tabla de un módulo lleva su prefijo (`seo\_keywords`, `seo\_audit\_findings`...)

\- \*\*Si para resolver algo de un módulo parece necesario tocar el núcleo, para y pregunta\*\* — es señal de que el módulo está mal diseñado, no un atajo válido



\## Estado actual / Roadmap Fase A



Completado:

\- ✅ Docker Compose (Postgres 16 + Next.js) funcionando

\- ✅ Tablas del starter migradas (`users`, `teams`, `team\_members`, `invitations`, `activity\_logs`)

\- ✅ Auth verificada de extremo a extremo (registro, hash bcrypt, sesión JWT, panel protegido)

\- ✅ Esquema núcleo añadido de forma aditiva: tablas `tenants`, `roles`, `user\_roles`, `projects`, más `users.tenant\_id` (`teams`/`team\_members` se mantienen intactas sin usar, pendientes de limpieza en una migración futura)

\- ✅ Tenant "Kijutech" creado, con los 4 roles fijos del sistema (`super\_admin`/`admin`/`editor`/`lector`); `team\_members` migrado a `user\_roles`

\- ✅ Pantalla de lista de proyectos + botón "nuevo proyecto" (`/dashboard/projects`)



Pendiente: sin próximos pasos definidos todavía — pregúntale a Enric antes de asumir el siguiente bloque de trabajo de la Fase A.



No construyas nada fuera de lo que se confirme explícitamente — es fácil derivar hacia "mejorar" cosas que no tocan en esta fase.



\## Reglas de trabajo



\- Empieza cada sesión confirmando en qué punto del roadmap se está trabajando

\- Commits pequeños y frecuentes, mensaje claro de qué cambia y por qué

\- No rompas lo que ya funciona: la auth end-to-end verificada es la base de todo lo demás



\## Reglas de autonomía (cuándo pedir aprobación y cuándo no)



A partir de la migración del esquema del núcleo (2026-08-16), el flujo de trabajo se relaja para tareas de bajo riesgo. La regla:



\*\*Puede trabajar en modo automático (auto mode), sin pedir aprobación paso a paso:\*\*

\- Crear componentes React, rutas nuevas, formularios

\- Estilos, maquetación, ajustes visuales

\- Cualquier cosa que no toque una tabla existente ni datos ya guardados en producción



\*\*Debe pedir aprobación explícita SIEMPRE, sin excepción, antes de:\*\*

\- Tocar `lib/db/schema.ts` o generar/aplicar cualquier migración de Drizzle

\- Modificar cualquier archivo dentro de `app/(login)/` o `lib/auth/` (todo lo relacionado con login y sesión)

\- Hacer `git push` a `origin main` (el commit local sí puede hacerlo sin preguntar, pero el push siempre se confirma)

\- Modificar `docker-compose.yml` o `Dockerfile.dev`

\- Borrar cualquier dato, tabla o archivo existente

\- Instalar una dependencia nueva (`pnpm add`)



Si tienes dudas sobre si una tarea entra en la segunda lista, pregunta antes de actuar — es preferible una pregunta de más que un cambio no revisado en algo crítico.



\## Backup obligatorio antes de migrar un módulo nuevo



Regla permanente, no solo para el módulo SEO: antes de aplicar cualquier migración de Drizzle que introduzca las tablas de un módulo nuevo, son obligatorios estos dos pasos:



\- \*\*Backup de Postgres con `pg\_dump`\*\*, ejecutado dentro del contenedor y volcado al host (el contenedor `kijutech\_db` no tiene bind mount al repo, así que hay que redirigir la salida, no dejarla dentro del contenedor):



  ```

  docker exec kijutech\_db pg\_dump -U kijutech -d kijutech\_db > backups/backup\_pre\_<modulo>\_<fecha>.sql

  ```



  (`<modulo>` = nombre del módulo, ej. `seo`; `<fecha>` = fecha en formato `YYYYMMDD`, ej. `20260816`). La carpeta `backups/` no está versionada — `.gitignore` ya excluye `backup\_\*.sql`, no hace falta tocar la configuración.



  Para restaurar si algo sale mal: `docker exec -i kijutech\_db psql -U kijutech -d kijutech\_db < backups/backup\_pre\_<modulo>\_<fecha>.sql` (sobre una BD limpia — el dump no usa `IF NOT EXISTS`).



\- \*\*Rama de Git separada\*\* para el trabajo del módulo (ej. `feature/fase-b-seo`), nunca migrar directamente sobre `main`.



Estos dos pasos van antes del `docker exec kijutech\_app pnpm db:migrate` de la sección de Docker de arriba, no lo sustituyen.

## Documentación automática de sesión

Antes de hacer el commit final de cada sesión, genera un archivo de
documentación en `/docs/sessions/` con el siguiente nombre:

  YYYY-MM-DD-HH-[descripcion-corta-en-kebab-case].md

`HH` es la hora de cierre de la sesión en formato 24h (00-23).

Ejemplo: `2026-08-17-16-fase-b-ajustes-ux.md`

Genera el archivo ANTES del commit, para que quede versionado en git
junto al código que describe.

### Estructura obligatoria del archivo

```markdown
# [Descripción corta de la sesión]
**Fecha:** YYYY-MM-DD  
**Rama:** nombre-de-la-rama  
**Commit:** hash del último commit sustantivo de la sesión (se rellena antes de commitear este documento)

## Qué se construyó
Lista de archivos nuevos y modificados relevantes, con una línea
explicando qué hace cada uno.

## Migraciones aplicadas
Para cada migración: nombre del archivo .sql y el SQL completo aplicado.
Si no hubo migraciones: "Ninguna."

## Decisiones técnicas tomadas en auto mode
Decisiones que Claude Code tomó por su cuenta durante la sesión
(no las pedidas explícitamente en el prompt) — qué problema encontró,
qué decidió y por qué. Si no hubo ninguna: "Ninguna."

## Qué verificar manualmente
Lista concreta de cosas que el usuario debe comprobar en el navegador
o en la base de datos para validar que todo funciona.

## Pendientes detectados
Cosas que Claude Code identificó durante la sesión que podrían necesitar
atención futura — bugs potenciales, mejoras obvias, deuda técnica.
Si no hay nada: "Ninguno."
```

### Reglas
- El archivo lo genera Claude Code, no el usuario — nunca pedirlo
  explícitamente, hacerlo siempre como parte del cierre de sesión
- Si la sesión tiene varios commits intermedios, el documento describe
  el trabajo completo de la sesión, no cada commit por separado
- El campo "Commit" lleva el hash del último commit sustantivo de la
  sesión (el de código, no el del propio documento). Se rellena ANTES
  de hacer el commit del documento, no después — así el hash siempre
  referencia un commit que ya existe
- La carpeta /docs/sessions/ se crea si no existe
- Estos archivos se suben al proyecto de Claude (chat) para mantener
  el historial técnico accesible entre sesiones

## Regla de UX mínima — pensar antes de construir

Antes de construir cualquier pantalla o funcionalidad nueva, Claude Code
debe hacerse estas preguntas y resolverlas en el diseño, sin que Enric
tenga que pedirlo explícitamente:

**Flujos básicos que toda entidad necesita:**
- ¿Se puede crear? → botón "Nuevo/Añadir" visible
- ¿Se puede editar? → botón "Editar" accesible desde la lista y desde el detalle
- ¿Se puede eliminar? → botón "Eliminar" con confirmación previa
- ¿Se puede archivar/pausar sin eliminar? → si la entidad tiene estados, debe poder cambiar de estado
- ¿Se puede resetear? → si hay progreso o datos acumulados, debe haber forma de volver al inicio
- ¿Se puede guardar sin completar? → guardar borrador siempre separado de "marcar como completado"

**Flujos de lista:**
- ¿Qué pasa si la lista está vacía? → estado vacío con mensaje claro y botón de acción
- ¿Cómo vuelve el usuario a la lista desde el detalle? → breadcrumb o botón "Volver" siempre presente
- ¿El usuario sabe dónde está? → título de página claro, navegación activa marcada

**Flujos de formulario:**
- ¿Qué pasa si el usuario cierra sin guardar? → los datos no se pierden (autoguardado) o hay aviso
- ¿Qué campos son obligatorios y cuáles opcionales? → indicado visualmente
- ¿Qué pasa después de guardar? → redirección clara, no pantalla en blanco

**Regla general:** si un usuario puede quedarse atascado sin saber qué hacer
a continuación, falta un botón o un mensaje. Añadirlo es parte del trabajo,
no un extra que Enric tiene que pedir.

## Directiva de optimización de IA

Antes de implementar cualquier función que use la API de IA
(llamadas de completado, generación de texto, análisis), Claude Code debe
evaluar si existe una solución más eficiente y escalar mejor que una
llamada de completado directa.

Preguntas obligatorias antes de implementar cualquier función de IA:

1. ¿Esta tarea requiere razonamiento o solo similitud/clasificación?
   - Si es similitud → considerar embeddings + clustering matemático
   - Si es razonamiento → llamada de completado normal

2. ¿El output puede ser muy largo y cortarse?
   - Si sí → considerar embeddings + completado corto final
   - O dividir en llamadas pequeñas con contexto compartido

3. ¿Hay una solución matemática/algorítmica que evite llamar
   a la IA completamente?
   - Ejemplo: deduplicación, ordenación, filtrado → no necesitan IA

4. ¿El mismo resultado se puede conseguir con un modelo más
   pequeño y barato?
   - Tareas simples de clasificación → Haiku o GPT-4o-mini
   - Tareas complejas de razonamiento → Sonnet o GPT-4o

Si Claude Code detecta una oportunidad de optimización de este
tipo durante el desarrollo, debe señalarla explícitamente antes
de implementar la solución obvia, aunque no haya sido pedida.
Ejemplos de lo que hay que señalar:
- "Esta función podría usar embeddings en vez de completado,
   ahorrando un 95% del coste — ¿lo implementamos así?"
- "Este análisis podría hacerse con un modelo más pequeño
   sin perder calidad — ¿usamos Haiku aquí?"
- "Esta tarea no necesita IA — un algoritmo simple lo resuelve
   igual de bien y gratis — ¿lo hacemos sin IA?"
