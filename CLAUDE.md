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



Pendiente (orden de trabajo):

1\. Renombrar `teams` → `tenants` y `team\_members` → `user\_roles` en una migración de Drizzle, añadiendo las columnas que falten para el esquema completo del núcleo

2\. Crear a mano el primer tenant "Kijutech"

3\. Construir la pantalla de lista de proyectos + botón "nuevo proyecto"



No construyas nada fuera de esta lista sin confirmarlo antes — es fácil derivar hacia "mejorar" cosas que no tocan en esta fase.



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

