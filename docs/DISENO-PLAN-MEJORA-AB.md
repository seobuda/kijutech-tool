# Plan de mejora A+B: diseño y revisión desde varios enfoques

**Fecha:** 26 nov 2026. **Aprobado por Enric:** «haz A y B y comprueba desde varios enfoques si es lo mejor».

## Qué se hizo
1. **Vista previa al aprobar.** Antes de crear el encargo se pueden cambiar el título, las horas, la lista, el responsable, la fecha y las páginas incluidas, y añadir una nota.
   - Por defecto salen la lista habitual del cliente, el responsable de SEO de su ficha y el plazo de su nivel.
   - Con la lista elegida, el encargo se crea **sin IA**.
2. **La descripción se ve con formato:** listas y negritas, sin asteriscos.
3. **Reparto por meses** con las horas del proyecto:
   - el mes actual descuenta lo ya aprobado;
   - lo grave va siempre este mes;
   - hay un botón «Aprobar lo de este mes» que enseña antes lo que va a poner.
4. **Por qué está cada propuesta donde está:** gravedad, impresiones, clics posibles al mes y por hora de trabajo, valor de negocio y horas. A igual impacto, va antes lo que menos cuesta.
5. **Qué esperamos ganar, en cifra:** «≈ +128 clics/mes», con las oportunidades del mapa.
6. **Descartar con motivo, y el motivo actúa:**
   - «ya está hecho» vuelve a pasar la auditoría;
   - «el cliente no lo quiere» se guarda en su memoria y rehace el mapa.
7. **Lo aprobado enseña el estado real del encargo:** responsable, fecha, en curso o hecho, y hasta cuándo se mide.
8. **Aviso por Telegram** la primera semana de cada mes, con lo que cabe en cada proyecto. Un solo mensaje por cuenta.

## Revisión desde varios enfoques (lo que haría un equipo de producto de una gran tecnológica)
| Enfoque | Pregunta | Respuesta del diseño |
|---|---|---|
| **Quien decide** (Enric) | ¿Decide en segundos y sin sorpresas? | El porqué está en una línea y el mes en el título de la sección. La vista previa enseña a quién va antes de crear nada. «Aprobar lo de este mes» resuelve el caso habitual en un clic, con confirmación. |
| **Quien ejecuta** (el equipo) | ¿El encargo se entiende y llega a quien toca? | Descripción con formato, páginas y búsquedas con sus cifras, origen «Plan de mejora SEO (proyecto)», el responsable del servicio y la prioridad traducida a la de ClickUp. |
| **Negocio y cliente** | ¿Se trabaja primero lo que más rinde? | La prioridad pesa impacto, valor de negocio (de las Preguntas) y esfuerzo, como el método RICE: alcance × impacto × confianza ÷ esfuerzo. Lo grave nunca espera. |
| **Escala** (cientos de proyectos) | ¿Aguanta sin coste ni límites? | La vista previa no llama a ClickUp (usa su caché) ni a la IA. El reparto por meses es un cálculo. El aviso mensual va en un solo mensaje por cuenta, una vez al mes. |
| **Aprender** | ¿El sistema mejora con el uso? | El motivo del descarte se guarda y actúa. La hipótesis lleva cifra, así se mide «esperado frente a real» (parte 7). La técnica queda registrada. |
| **Riesgo** | ¿Puede crear algo que nadie quería? | Aprobar reclama la propuesta (nunca dos encargos). Lo que se quita de un encargo vuelve al plan. Sin lista elegida, se comporta como antes. |

## Alternativas descartadas
- **Tablero tipo Kanban con arrastrar y soltar:** más vistoso, pero más difícil de usar en el móvil y no aporta decisión. El reparto por meses lo calcula el sistema; arrastrar sería un ajuste manual que de momento no se guarda (ver «Pendiente»).
- **Aprobar solo lo que cabe, sin que nadie lo apruebe:** es lo que se busca a largo plazo («Operaciones sustituye a un humano»), pero hoy los encargos van a personas y Enric quiere supervisar. Queda como ajuste futuro por proyecto.
- **Que la IA ordene y redacte el plan:** las reglas son explicables, gratuitas y estables. La IA entra cuando las reglas no basten, con el «jefe de SEO» de la parte 8.
- **Pedir la lista y el responsable a ClickUp en directo:** lo prohíbe la regla de caché de ClickUp y sería lento. Se usa la caché.

## Pendiente
- **Mover una propuesta a otro mes a mano**, o fijarla. Necesita guardar el mes elegido (una columna nueva en `seo_plan_items`, con migración y tu aprobación). Hoy el reparto se recalcula siempre.
- **El resultado de la medición** (esperado frente a real): parte 7 del inventario.
- **Propuestas de contenido, local y enlaces:** partes 3, 4 y 6.
