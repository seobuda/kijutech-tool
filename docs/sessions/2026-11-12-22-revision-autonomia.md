# Revisión de autonomía del sistema
**Fecha:** 2026-11-12  
**Rama:** docs/revision-autonomia  
**Commit:** ca250d7c

## Qué se construyó
- Despliegue de 5B en producción (`main` `75481a59`, migración 0045, backup `backup_pre_deploy_20261112_2200.sql.gz`): 46 migraciones, web 200, Telegram sin errores y 0 errores en logs.
- `docs/REVISION-AUTONOMIA.md` (nuevo): revisión del sistema completo con el objetivo «autónomo, que informe de lo necesario». Incluye diagnóstico, principios de gestión por excepción, hallazgos (activación, bloqueos de autonomía, informes, resiliencia, orden) y plan por fases.

## Migraciones aplicadas
Ninguna en esta sesión de revisión (la 0045 se aplicó en producción con el despliegue de 5B, documentada en `2026-11-12-18-tiempos-de-tarea-5b.md`).

## Decisiones técnicas tomadas en auto mode
- La revisión se hizo sobre el código y la documentación: el permiso de la sesión bloqueó la consulta de solo lectura a la base de producción. Lo no verificado queda marcado y la consulta está al final del documento.
- Se cambia la recomendación anterior («encender la jornada ya»): sin festivos ni vacaciones por rango, la jornada molestaría en días libres. Va después del calendario (fase 2).

## Qué verificar manualmente
- Ejecutar la consulta del §5 de `docs/REVISION-AUTONOMIA.md` para confirmar en producción el modo pruebas, los vinculados, las automatizaciones, las acciones del agente y los correos.
- Revisar con la cuenta de admin Equipo → Tiempos y el selector «Mi panel:» de Fichas (pendiente de 5B).

## Pendientes detectados
- Todo el plan del §4 de `docs/REVISION-AUTONOMIA.md`.
- Los más urgentes:
  - B2: las propuestas de respuesta a correos no salen en Mi bandeja ni en los resúmenes.
  - B1: faltan festivos y vacaciones por rango.
  - D1: el vigilante está en el mismo servidor.
  - D3: las copias están solo en DigitalOcean y la restauración nunca se ha probado.
  - E: partes desfasadas de `docs/ESTADO.md`.
