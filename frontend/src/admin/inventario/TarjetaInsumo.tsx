import { useId, useRef, useState } from 'react';
import type { Insumo } from '../../api/inventario';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import {
  TEXTO_NIVEL,
  barraDeStock,
  formatoCantidad,
  nivelDeStock,
  singularDeUnidad,
  textoDelMinimo,
  type CuerpoMovimiento,
  type TipoMovimiento,
} from '../../lib/inventario';
import type { Problema } from '../useUsuarios';
import { FormularioMovimiento } from './FormularioMovimiento';
import { HistorialInsumo } from './HistorialInsumo';

interface Props {
  insumo: Insumo;
  /** superadmin y admin: compras, ajustes, editar, desactivar y ver costos (el backend manda null al empleado). */
  gestiona: boolean;
  ocupado: boolean;
  error: string | undefined;
  /** Cuenta los movimientos de este insumo: el historial abierto se vuelve a pedir cuando cambia. */
  version: number;
  alRegistrar: (cuerpo: CuerpoMovimiento) => Promise<Problema | null>;
  alEditar: () => void;
  alCambiarActivo: () => void;
  alVencerSesion: (mensaje: string) => void;
}

/** Barra de stock contra el mínimo. Lo dice el texto de al lado; la barra y su color son un refuerzo. */
function BarraStock({ insumo }: { insumo: Insumo }) {
  const barra = barraDeStock(insumo);
  if (!barra) return null;
  const nivel = nivelDeStock(insumo);
  return (
    <div className={`inv-barra inv-barra--${nivel}`} aria-hidden="true">
      <span className="inv-barra__relleno" style={{ width: `${String(Math.round(barra.relleno * 1000) / 10)}%` }} />
      <span className="inv-barra__minimo" style={{ left: `${String(Math.round(barra.minimo * 1000) / 10)}%` }} />
    </div>
  );
}

/** Un insumo: cuánto queda contra el mínimo, acciones rápidas (Usé, Compré, Ajustar) e historial. */
export function TarjetaInsumo({ insumo, gestiona, ocupado, error, version, alRegistrar, alEditar, alCambiarActivo, alVencerSesion }: Props) {
  const id = useId();
  const tarjetaRef = useRef<HTMLElement>(null);
  const [accion, setAccion] = useState<TipoMovimiento | null>(null);
  const [historial, setHistorial] = useState(false);
  const nivel = nivelDeStock(insumo);
  const etiquetaNivel = TEXTO_NIVEL[nivel];

  const cerrarFormulario = () => {
    const cual = accion;
    setAccion(null);
    // El foco vuelve al botón que abrió el formulario.
    requestAnimationFrame(() => {
      tarjetaRef.current?.querySelector<HTMLElement>(`[data-abre="${cual ?? ''}"]`)?.focus();
    });
  };

  const abrir = (tipo: TipoMovimiento) => () => {
    setAccion((actual) => (actual === tipo ? null : tipo));
  };

  const clases = ['turno', 'inv', `inv--${nivel}`, insumo.activo ? '' : 'inv--inactivo'].filter(Boolean).join(' ');

  return (
    <li>
      <article ref={tarjetaRef} className={clases} aria-labelledby={`${id}-nombre`} aria-busy={ocupado}>
        <header className="inv__cabeza">
          <div className="inv__quien">
            <h3 id={`${id}-nombre`} className="inv__nombre">
              {insumo.nombre}
            </h3>
            {insumo.categoria && <p className="inv__categoria">{insumo.categoria}</p>}
          </div>
          <div className="inv__etiquetas">
            {!insumo.activo && <span className="inv__etiqueta inv__etiqueta--inactivo">Inactivo</span>}
            {insumo.activo && etiquetaNivel && (
              <span className={`inv__etiqueta inv__etiqueta--${nivel}`}>
                <Icono nombre="alerta" tamano={16} />
                {etiquetaNivel}
              </span>
            )}
          </div>
        </header>

        <div className="inv__stock">
          <p className="inv__cantidad">
            <strong>{formatoCantidad(insumo.stock, insumo.unidad)}</strong>
            <span> en stock</span>
          </p>
          <BarraStock insumo={insumo} />
          <p className="inv__minimo">{textoDelMinimo(insumo)}</p>
        </div>

        {gestiona && (insumo.costoUnitario !== null || insumo.valorEnStock !== null) && (
          <p className="inv__plata">
            {insumo.costoUnitario !== null && (
              <span>
                Costo {formatoPesos(insumo.costoUnitario)} por {singularDeUnidad(insumo.unidad)}
              </span>
            )}
            {insumo.valorEnStock !== null && <span>En stock {formatoPesos(insumo.valorEnStock)}</span>}
          </p>
        )}

        {accion && (
          <FormularioMovimiento
            key={accion}
            insumo={insumo}
            tipo={accion}
            alEnviar={alRegistrar}
            alTerminar={cerrarFormulario}
          />
        )}

        {error && (
          <p className="turno__error" role="alert">
            <Icono nombre="alerta" tamano={18} />
            {error}
          </p>
        )}

        {!accion && (
          <div className="turno__acciones inv__acciones">
            {insumo.activo && (
              <>
                <button
                  type="button"
                  className="boton boton--primario boton--chico"
                  data-abre="uso"
                  disabled={ocupado}
                  aria-label={`Anotar lo que usaste de ${insumo.nombre}`}
                  onClick={abrir('uso')}
                >
                  <Icono nombre="menos" tamano={18} />
                  Usé
                </button>
                {gestiona && (
                  <>
                    <button
                      type="button"
                      className="boton boton--secundario boton--chico"
                      data-abre="compra"
                      disabled={ocupado}
                      aria-label={`Cargar una compra de ${insumo.nombre}`}
                      onClick={abrir('compra')}
                    >
                      <Icono nombre="mas" tamano={18} />
                      Compré
                    </button>
                    <button
                      type="button"
                      className="boton boton--secundario boton--chico"
                      data-abre="ajuste"
                      disabled={ocupado}
                      aria-label={`Ajustar el stock de ${insumo.nombre} con un conteo`}
                      onClick={abrir('ajuste')}
                    >
                      <Icono nombre="lapiz" tamano={18} />
                      Ajustar
                    </button>
                  </>
                )}
              </>
            )}
            <button
              type="button"
              className="boton boton--fantasma boton--chico"
              aria-expanded={historial}
              aria-controls={`${id}-historial`}
              onClick={() => {
                setHistorial((abierto) => !abierto);
              }}
            >
              <Icono nombre="historial" tamano={18} />
              Historial
            </button>
            {gestiona && (
              <>
                <button type="button" className="boton boton--fantasma boton--chico" disabled={ocupado} onClick={alEditar}>
                  <Icono nombre="lapiz" tamano={18} />
                  Editar
                </button>
                <button
                  type="button"
                  className="boton boton--fantasma boton--chico"
                  disabled={ocupado}
                  aria-label={`${insumo.activo ? 'Desactivar' : 'Reactivar'} ${insumo.nombre}`}
                  onClick={alCambiarActivo}
                >
                  {insumo.activo ? 'Desactivar' : 'Reactivar'}
                </button>
              </>
            )}
          </div>
        )}

        <div id={`${id}-historial`}>
          {historial && <HistorialInsumo insumo={insumo} version={version} alVencerSesion={alVencerSesion} />}
        </div>
      </article>
    </li>
  );
}
