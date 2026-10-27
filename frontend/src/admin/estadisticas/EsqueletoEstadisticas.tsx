/**
 * Esqueleto de la sección mientras llega la primera respuesta: las tres tarjetas, el resumen y dos gráficos, con las
 * mismas clases que lo real para que nada salte. Decorativo (`aria-hidden`); el "Cargando…" lo anuncia la vista.
 */
export function EsqueletoEstadisticas({ completo }: { completo: boolean }) {
  return (
    <div className="est-esqueleto" aria-hidden="true">
      {completo && (
        <div className="est-kpis">
          {[0, 1, 2].map((n) => (
            <div key={n} className="est-kpi est-kpi--esqueleto">
              <span className="esq esq--xs" />
              <span className="esq esq--m esq--titulo" />
              <span className="esq esq--s" />
              <span className="esq esq--l" />
            </div>
          ))}
        </div>
      )}
      <div className="est-tarjeta">
        <span className="esq esq--m esq--titulo" />
        <span className="esq esq--l" />
        <span className="esq esq--completo est-esqueleto__grafico" />
      </div>
      <div className="est-tarjeta">
        <span className="esq esq--m esq--titulo" />
        <span className="esq esq--l" />
        <span className="esq esq--completo est-esqueleto__fila" />
        <span className="esq esq--completo est-esqueleto__fila" />
        <span className="esq esq--completo est-esqueleto__fila" />
      </div>
    </div>
  );
}
