# Rediseño de la interfaz (sistema de diseño, armazón y paleta de comandos)
**Fecha:** 2026-11-11  
**Rama:** feature/ui-redesign (desde `feature/memoria-cliente-email`, que ya incluye `fix/operaciones-revision`)  
**Commit:** 583e791c

## Qué se construyó
- `app/globals.css`: sistema de diseño nuevo. Tokens OKLCH en `:root` y `.dark` (fondo, tarjeta, texto, marca naranja, `success`/`warning`/`info`/`destructive` con versión `-soft` y `warning-strong` para texto legible), radios, sombras, animación `fade-up`, foco visible, `prefers-reduced-motion` y clase `.data-table`.
- `app/layout.tsx`: tipografía Geist (con `next/font`, sin dependencias nuevas) y script de tema que aplica claro/oscuro/sistema antes de pintar.
- `components/app-shell/nav.ts`: navegación única (grupos Trabajo, Inteligencia, Administración, Cuenta), pestañas de Operaciones con iconos, migas y visibilidad por rol (solo de interfaz).
- `components/app-shell/app-shell.tsx`: barra lateral agrupada y plegable (se recuerda), indicador de sección activa, buscador, menú de usuario con selector de tema y cerrar sesión, menú móvil (Radix Dialog) y barra superior con migas.
- `components/app-shell/command-palette.tsx`: paleta Ctrl+K / ⌘K con búsqueda sin acentos, flechas y Enter.
- `components/ui/page.tsx`: `PageContainer`, `PageHeader`, `Badge`, `StatCard`, `EmptyState`, `Section`, `Skeleton`.
- `app/(dashboard)/layout.tsx` y `dashboard/layout.tsx`: sustituidos por el armazón nuevo.
- `operaciones/layout.tsx` y `operaciones-tabs.tsx`: cabecera con icono y pestañas con iconos, desplazables en móvil.
- 68 pantallas: colores fijos de Tailwind (`bg-white`, `text-gray-500`, `bg-orange-500`, `text-red-600`…) sustituidos por tokens (817 cambios, script de un solo uso fuera del repo); contenedores de página unificados (ancho máximo 1400 px).

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Sin dependencias nuevas** (ni `cmdk`, ni `next-themes`, ni librerías de animación): la paleta y el tema se hicieron con Radix (ya instalado) y unas pocas líneas propias, para no pedir aprobación de `pnpm add` y no añadir peso.
- **Codemod de colores en lugar de rediseñar pantalla a pantalla:** con 110 archivos y 765 colores fijos, migrar a tokens primero hace que el modo oscuro y la paleta nueva lleguen a todas las pantallas a la vez; el rediseño fino de cada pantalla puede hacerse después sobre esa base.
- **`app/(login)/` no se tocó:** CLAUDE.md exige aprobación para cualquier cambio ahí. El inicio de sesión hereda la tipografía y el fondo nuevos, pero conserva sus colores antiguos.
- **Contraste de avisos:** el ámbar sobre fondo claro se leía mal, así que se creó `warning-strong` para el texto.
- **Las páginas de Ajustes de usuario** (`general`, `security`, `activity`) pasan al grupo «Cuenta» del menú; antes estaban al mismo nivel que Operaciones.

## Qué verificar manualmente
- **No se pudo revisar en el navegador:** el permiso de la sesión bloqueó arrancar un contenedor de la app (ni `docker compose up` ni una copia temporal). Antes de fusionar hay que verificar en `http://127.0.0.1:3000`:
  - Barra lateral: grupos, sección activa, plegar y desplegar, y que recuerda el estado al recargar.
  - Ctrl+K: abre la paleta, busca «enc» → Encargos, se mueve con flechas, abre con Enter y se cierra con Esc.
  - Tema: Claro, Oscuro y Sistema desde el menú de usuario; sin parpadeo al recargar. En modo oscuro revisar Bloc, Clientes, Correos, Automatizaciones, Mapa y SEO.
  - Móvil (ancho 390): el menú se abre y se cierra, y las pestañas de Operaciones se desplazan.
  - Los colores de estado (verde, ámbar, rojo) siguen distinguiéndose en las tablas y avisos.
- `pnpm test`: 114 OK. Las 8 de `http.test.ts` necesitan el servidor arrancado. `check-architecture-map`: OK.

## Pendientes detectados
- Rediseño fino de las pantallas grandes con las piezas nuevas (`PageHeader`, `StatCard`, `.data-table`, `EmptyState`): Bloc de notas, Clientes, Equipo, Encargos, Piloto y Automatizaciones.
- Pantalla de inicio de sesión (necesita aprobación por estar en `app/(login)/`).
- `architecture-map-client.tsx` conserva `!bg-gray-400` en los conectores del diagrama.
- El Mapa Visual no necesita cambios: no se añadió ningún proceso, tabla, prompt ni automatización.
