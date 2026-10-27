import type { TablaDatos } from '../../../lib/tablasEstadisticas';

/**
 * Los mismos números del gráfico en una tabla real, plegada en "Ver los números": para lectores de pantalla, para
 * quien prefiere leer y para cuando el color o el dibujo no alcanzan. Los textos van como texto (no HTML).
 */
export function TablaAlternativa({ tabla }: { tabla: TablaDatos }) {
  return (
    <details className="est-tabla">
      <summary className="est-tabla__resumen">Ver los números</summary>
      {tabla.filas.length === 0 ? (
        <p className="est-tabla__vacia">No hay filas para mostrar en este período.</p>
      ) : (
        // Región con scroll propio: enfocable para poder recorrerla con el teclado.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <div className="est-tabla__scroll" role="region" aria-label={`Tabla: ${tabla.titulo}`} tabIndex={0}>
          <table className="est-tabla__tabla">
            <caption className="visualmente-oculto">{tabla.titulo}</caption>
            <thead>
              <tr>
                {tabla.columnas.map((columna, i) => (
                  <th key={columna} scope="col" className={tabla.numericas[i] ? 'est-num' : undefined}>
                    {columna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.filas.map((fila, f) => (
                <tr key={f}>
                  {fila.map((celda, c) =>
                    c === 0 ? (
                      <th key={c} scope="row">
                        {celda}
                      </th>
                    ) : (
                      <td key={c} className={tabla.numericas[c] ? 'est-num' : undefined}>
                        {celda}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
