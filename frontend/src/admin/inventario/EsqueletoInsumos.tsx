/**
 * Esqueleto del inventario: mismas tarjetas y alturas mínimas que la lista real, para que al llegar los datos nada
 * salte. Decorativo (`aria-hidden`): el «Cargando el inventario…» de la vista ya lo anuncia.
 */
export function EsqueletoInsumos({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <ul className="turnos inv-lista" aria-hidden="true">
      {Array.from({ length: cantidad }, (_, n) => (
        <li key={n} className="turno esq-tarjeta inv inv--esqueleto">
          <div className="esq-fila esq-fila--entre">
            <span className="esq esq--m esq--titulo" />
            <span className="esq esq--xs esq--sello" />
          </div>
          <span className="esq esq--s" />
          <span className="esq esq--completo esq--barra-stock" />
          <div className="esq-fila">
            <span className="esq esq--xs esq--boton" />
            <span className="esq esq--xs esq--boton" />
            <span className="esq esq--xs esq--boton" />
          </div>
        </li>
      ))}
    </ul>
  );
}
