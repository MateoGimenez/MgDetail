import type { Gasto } from '../../api/finanzas';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import { nombreDeCategoria } from '../../lib/finanzas';

interface Props {
  gasto: Gasto;
  alEditar: (gasto: Gasto) => void;
  alBorrar: (gasto: Gasto) => void;
}

/**
 * Un gasto: qué fue, la categoría y el proveedor, y cuánto. Los de inventario se marcan con texto y no tienen
 * acciones: se corrigen desde Inventario (el backend también los rechaza con 409).
 */
export function FilaGasto({ gasto, alEditar, alBorrar }: Props) {
  const deInventario = gasto.origen === 'inventario';
  return (
    <li className="gasto">
      <div className="gasto__datos">
        <p className="gasto__descripcion">{gasto.descripcion}</p>
        <p className="gasto__detalle">
          {nombreDeCategoria(gasto.categoria)}
          {gasto.proveedor ? ` · ${gasto.proveedor}` : ''}
        </p>
        {deInventario && (
          <p className="gasto__origen">
            <span className="senal">Desde Inventario</span>
            <span className="gasto__origen-texto">Viene de una compra de insumos: se corrige desde Inventario.</span>
          </p>
        )}
      </div>
      <p className="gasto__monto">{formatoPesos(gasto.monto)}</p>
      {!deInventario && (
        <div className="gasto__acciones">
          <button
            type="button"
            className="fin-icono"
            aria-label={`Editar el gasto ${gasto.descripcion}`}
            onClick={() => {
              alEditar(gasto);
            }}
          >
            <Icono nombre="lapiz" tamano={20} />
          </button>
          <button
            type="button"
            className="fin-icono fin-icono--peligro"
            aria-label={`Borrar el gasto ${gasto.descripcion}`}
            onClick={() => {
              alBorrar(gasto);
            }}
          >
            <Icono nombre="papelera" tamano={20} />
          </button>
        </div>
      )}
    </li>
  );
}
