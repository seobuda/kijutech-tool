// SEO · Jefe SEO: error con mensaje apto para enseñar al usuario (plan de servicio y cambios propuestos). PURO.
export class PlanError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}
