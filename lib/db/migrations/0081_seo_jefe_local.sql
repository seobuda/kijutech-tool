-- SEO · Jefe SEO: el orden del plan depende de cómo atiende el negocio (análisis de Fable 5.2, opción C; decisiones de Enric
-- del 27 nov 2026). Solo datos: versión 2 del prompt seo_jefe_plan_maestro. En un negocio local, lo básico de la ficha de
-- Google va siempre en el primer trimestre; las reseñas continuas solo si los datos dicen que va por detrás o parada; las
-- reseñas las pide el cliente; las publicaciones de la ficha bajan de prioridad. Solo cambia si el prompt sigue en la v1
-- original (si alguien lo editó desde el panel, no se pisa).
UPDATE "ai_prompts"
SET
  "system_prompt" = replace(
    replace(
      "system_prompt",
      $old1$2. Orden de la agencia (salvo motivo claro en los datos): arreglar lo que está roto y frena → exprimir lo que ya posiciona cerca del top → páginas de servicio y zona → contenido nuevo con demanda → SEO local (ficha y reseñas) → autoridad y enlaces → visibilidad en respuestas de IA. Si te sales de este orden, explica por qué con evidencias.$old1$,
      $new1$2. Orden de la agencia (salvo motivo claro en los datos), según CÓMO ATIENDE el negocio (lo dice el título de la sección «Ficha de Google y mapa»):
   - Local físico (taller, clínica, comercio): dos carriles desde el principio. En el trimestre 1, lo básico de la ficha de Google (reclamada, categoría principal y adicionales, servicios, horario, nombre-dirección-teléfono iguales que en la web) junto a los arreglos de lo roto; es trabajo de pocas horas y una sola vez. Después: exprimir lo que ya posiciona → páginas de servicio y zona → contenido nuevo → autoridad → IA.
   - A domicilio o por zona (reformas, fontanería): lo roto primero; la ficha, exprimir lo que posiciona y las páginas de servicio y zona al mismo nivel; luego contenido, autoridad e IA.
   - Solo online o sin atención al público: arreglar → exprimir lo que posiciona → servicio → contenido → autoridad → IA. Nada de ficha de Google sin un dato L: que lo justifique.
   - Sin confirmar cómo atiende: arreglar → exprimir → servicio y zona → contenido → local → autoridad → IA, y pon en «lo_que_no_se» que falta confirmarlo.
   Reseñas: la línea continua de reseñas solo si un dato L:resenas dice que va por detrás de la competencia o parada. Las reseñas las pide el cliente con el enlace y la plantilla que prepara la agencia: nunca propongas que la agencia escriba a los clientes del negocio. Las publicaciones de la ficha son lo último (solo si sobran horas). Nunca digas que la ficha es «lo más rentable» sin un dato L: que lo muestre.
   Si te sales de este orden, explica por qué con evidencias.$new1$
    ),
    $old2$local → local_ficha_resenas;$old2$,
    $new2$local → null (lo básico de la ficha: identificarla o reclamarla, categoría, servicios, horario; una vez) o local_ficha_resenas (reseñas y cuidado continuo);$new2$
  ),
  "version" = "version" + 1,
  "updated_at" = now()
WHERE "key" = 'seo_jefe_plan_maestro'
  AND "version" = 1
  AND position($chk$2. Orden de la agencia (salvo motivo claro en los datos): arreglar lo que está roto$chk$ IN "system_prompt") > 0;
