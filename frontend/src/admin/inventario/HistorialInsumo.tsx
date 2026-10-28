import type { Insumo, Movimiento } from '../../api/inventario';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import { momentoEnLaRioja } from '../../lib/fechas';
import { ETIQUETA_MOVIMIENTO, formatoCantidadConSigno } from '../../lib/inventario';
import { useMovimientos } from './useMovimientos';

interface Props {
  insumo: Pick<Insumo, 'id' | 'nombre' | 'unidad'>;
  version: number;
  alVencerSesion: (mensaje: string) => void;
}

/** Cada renglón dice qué pasó, cuánto, quién y cuándo; el motivo y, para quien ve plata, lo pagado. */
function Renglon({ movimiento: m, unidad }: { movimiento: Movimiento; unidad: Insumo['unidad'] }) {
  const detalle = [m.proveedor, m.nota].filter(Boolean).join(' · ');
  return (
    <li className={`inv-mov inv-mov--${m.tipo}`}>
      <p className="inv-mov__linea">
        <span className="inv-mov__tipo">{ETIQUETA_MOVIMIENTO[m.tipo]}</span>
        <strong className="inv-mov__cantidad">{formatoCantidadConSigno(m.cantidad, unidad)}</strong>
      </p>
      <p className="inv-mov__quien">
        {m.persona?.nombre ?? 'Alguien del equipo'} · {momentoEnLaRioja(m.createdAt)}
      </p>
      {detalle && <p className="inv-mov__detalle">{detalle}</p>}
      {m.costoTotal !== null && m.costoTotal > 0 && <p className="inv-mov__detalle">Pagado {formatoPesos(m.costoTotal)}</p>}
    </li>
  );
}

/** Historial de movimientos de un insumo (más nuevos primero). Se monta solo cuando la persona lo abre. */
export function HistorialInsumo({ insumo, version, alVencerSesion }: Props) {
  const h = useMovimientos(insumo.id, version, alVencerSesion);

  return (
    <section className="inv-historial" aria-label={`Movimientos de ${insumo.nombre}`}>
      {h.cargando && (
        <p className="panel__cargando" role="status">
          Cargando movimientos…
        </p>
      )}

      {h.error && (
        <div className="panel__error" role="alert">
          <Icono nombre="alerta" tamano={22} />
          <div>
            <p>No pudimos cargar el historial. {h.error}</p>
            <button type="button" className="boton boton--primario boton--chico" onClick={h.reintentar}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {h.items && h.items.length === 0 && (
        <p className="inv-historial__vacio">Todavía no hay movimientos. Cuando anotes un uso o una compra, aparece acá.</p>
      )}

      {h.items && h.items.length > 0 && (
        <>
          <ol className="inv-historial__lista" role="list">
            {h.items.map((m) => (
              <Renglon key={m.id} movimiento={m} unidad={insumo.unidad} />
            ))}
          </ol>
          {h.items.length < h.total && (
            <div className="inv-historial__mas">
              <button type="button" className="boton boton--secundario boton--chico" disabled={h.cargandoMas} onClick={() => void h.cargarMas()}>
                {h.cargandoMas ? 'Cargando…' : `Ver movimientos anteriores (${String(h.total - h.items.length)} más)`}
              </button>
              {h.errorMas && (
                <p className="turno__error" role="alert">
                  <Icono nombre="alerta" tamano={18} />
                  {h.errorMas}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
