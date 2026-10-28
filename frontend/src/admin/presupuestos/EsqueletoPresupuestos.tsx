/**
 * Esqueleto de la lista de presupuestos: mismas tarjetas y alturas mínimas que la lista real. Decorativo
 * (`aria-hidden`): el «Cargando presupuestos…» de la vista ya lo anuncia.
 */
export function EsqueletoPresupuestos({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <ul className="turnos pres-lista" aria-hidden="true">
      {Array.from({ length: cantidad }, (_, n) => (
        <li key={n} className="turno esq-tarjeta pres pres--esqueleto">
          <div className="esq-fila esq-fila--entre">
            <span className="esq esq--m esq--titulo" />
            <span className="esq esq--xs esq--sello" />
          </div>
          <span className="esq esq--s esq--titulo" />
          <span className="esq esq--l" />
          <div className="esq-fila">
            <span className="esq esq--xs esq--boton" />
            <span className="esq esq--xs esq--boton" />
          </div>
        </li>
      ))}
    </ul>
  );
}
