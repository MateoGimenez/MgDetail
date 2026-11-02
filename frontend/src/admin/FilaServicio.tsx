import { useId } from 'react';
import type { ServicioPanel } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { ETIQUETA_VEHICULO, type VehiculoTipo } from '../api/contract';
import { textoPesos } from '../data/servicios';
import { duracionPorVehiculo, precioPorVehiculo, tiposOfrecidos } from '../lib/precios';
import { idBajar, idSubir } from './useServicios';

interface Props {
  servicio: ServicioPanel;
  /** La pestaña desde la que se ve: el precio que se muestra es el de este vehículo. */
  vehiculo: VehiculoTipo;
  /** false si es el único vehículo del servicio: no se puede quitar (se oculta en su lugar). */
  puedeQuitar: boolean;
  /** Posición en el catálogo, desde 1. */
  puesto: number;
  total: number;
  /** superadmin y admin; el empleado ve la fila sin controles (la regla real la aplica el backend). */
  editable: boolean;
  ocupado: boolean;
  /** Hay un cambio de orden guardándose: las flechas esperan. */
  ordenando: boolean;
  error: string | undefined;
  alSubir: () => void;
  alBajar: () => void;
  alEditar: () => void;
  /** Pide confirmación para quitar el servicio de este vehículo (no lo elimina). */
  alQuitar: () => void;
  alCambiarDestacado: () => void;
  alCambiarActivo: () => void;
}


const cantidad = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${String(n)} ${varios}`);

/** Un servicio del catálogo: puesto (con subir y bajar), datos que se ven en la web, sellos y acciones. */
export function FilaServicio({
  servicio,
  vehiculo,
  puedeQuitar,
  puesto,
  total,
  editable,
  ocupado,
  ordenando,
  error,
  alSubir,
  alBajar,
  alEditar,
  alQuitar,
  alCambiarDestacado,
  alCambiarActivo,
}: Props) {
  const id = useId();
  const precio = precioPorVehiculo(servicio, vehiculo);
  const tambien = tiposOfrecidos(servicio).filter((t) => t !== vehiculo);
  const clases = ['turno', 'servicio', servicio.activo ? '' : 'servicio--inactivo', servicio.destacado ? 'servicio--destacado' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <li className="servicios-panel__item">
      <article className={clases} aria-labelledby={`${id}-nombre`} aria-busy={ocupado}>
        <div className="servicio__puesto">
          {editable && (
            <button
              id={idSubir(servicio.id)}
              type="button"
              className="boton-icono"
              aria-label={`Subir ${servicio.nombre}`}
              disabled={puesto === 1 || ordenando || ocupado}
              onClick={alSubir}
            >
              <Icono nombre="arriba" tamano={18} />
            </button>
          )}
          <span className="servicio__numero">
            <span className="visualmente-oculto">Puesto </span>
            {puesto}
            <span className="visualmente-oculto"> de {total}</span>
          </span>
          {editable && (
            <button
              id={idBajar(servicio.id)}
              type="button"
              className="boton-icono"
              aria-label={`Bajar ${servicio.nombre}`}
              disabled={puesto === total || ordenando || ocupado}
              onClick={alBajar}
            >
              <Icono nombre="abajo" tamano={18} />
            </button>
          )}
        </div>

        <div className="servicio__cuerpo">
          <header className="turno__cabeza">
            <div className="turno__quien">
              <h3 id={`${id}-nombre`} className="turno__nombre">
                {servicio.nombre}
              </h3>
              <code className="servicio__slug">{servicio.id}</code>
            </div>
            <div className="servicio__sellos">
              {servicio.destacado && (
                <span className="sello sello--destacado">
                  <Icono nombre="estrella" tamano={14} />
                  Destacado
                </span>
              )}
              <span className={servicio.activo ? 'sello sello--confirmado' : 'sello sello--completado'}>
                {servicio.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </header>

          <p className="servicio__resumen">{servicio.resumen}</p>

          <dl className="turno__datos servicio__datos">
            <div className="servicio__precios">
              <dt>Precio desde · {ETIQUETA_VEHICULO[vehiculo]}</dt>
              <dd>
                <span className={precio === null ? 'servicio__consulta' : 'servicio__precio-valor servicio__precio-grande'}>
                  {precio === null ? 'Consultá (sin precio cargado)' : textoPesos(precio)}
                </span>
                <span className="servicio__tambien">
                  {tambien.length > 0
                    ? `También para ${tambien.map((t) => ETIQUETA_VEHICULO[t]).join(' y ')}`
                    : `Solo para ${ETIQUETA_VEHICULO[vehiculo].toLowerCase()}`}
                </span>
              </dd>
            </div>
            <div>
              <dt>Duración · {ETIQUETA_VEHICULO[vehiculo]}</dt>
              <dd className={duracionPorVehiculo(servicio, vehiculo) === null ? 'servicio__consulta' : undefined}>
                {duracionPorVehiculo(servicio, vehiculo) ?? 'Sin cargar'}
              </dd>
            </div>
            <div>
              <dt>Contenido</dt>
              <dd>
                {cantidad(servicio.incluye.length, 'ítem', 'ítems')} ·{' '}
                {cantidad(servicio.glosario.length, 'término', 'términos')}
              </dd>
            </div>
          </dl>

          {!servicio.activo && (
            <p id={`${id}-nota`} className="servicio__nota">
              No aparece en la web ni en el formulario de turnos.
              {editable && ' Para destacarlo, primero activalo.'}
            </p>
          )}

          {error && (
            <p className="turno__error" role="alert">
              <Icono nombre="alerta" tamano={18} />
              {error}
            </p>
          )}

          {editable ? (
            <div className="turno__acciones">
              <button type="button" className="boton boton--primario boton--chico" disabled={ocupado} onClick={alEditar}>
                <Icono nombre="lapiz" tamano={18} />
                Editar
              </button>
              <button
                type="button"
                className="boton boton--secundario boton--chico"
                // Un inactivo no se puede destacar (el backend responde 400): se activa primero.
                disabled={ocupado || !servicio.activo}
                aria-describedby={servicio.activo ? undefined : `${id}-nota`}
                onClick={alCambiarDestacado}
              >
                <Icono nombre="estrella" tamano={18} />
                {servicio.destacado ? 'Quitar destacado' : 'Destacar'}
              </button>
              <button
                type="button"
                className={
                  servicio.activo
                    ? 'boton boton--fantasma boton--chico servicio__activar'
                    : 'boton boton--secundario boton--chico servicio__activar'
                }
                disabled={ocupado}
                onClick={alCambiarActivo}
              >
                {servicio.activo ? (
                  <>
                    <Icono nombre="ojoTachado" tamano={18} />
                    Ocultar en la web
                  </>
                ) : (
                  <>
                    <Icono nombre="ojo" tamano={18} />
                    Mostrar en la web
                  </>
                )}
              </button>
              <button
                type="button"
                className="boton boton--fantasma boton--chico servicio__quitar"
                disabled={ocupado || !puedeQuitar}
                aria-describedby={puedeQuitar ? undefined : `${id}-quitar-nota`}
                onClick={alQuitar}
              >
                <Icono nombre="cerrar" tamano={18} />
                Quitar de {ETIQUETA_VEHICULO[vehiculo].toLowerCase()}
              </button>
              {!puedeQuitar && (
                <p id={`${id}-quitar-nota`} className="servicio__nota servicio__nota--accion">
                  Es el único vehículo de este servicio. Para dejar de mostrarlo, usá «Ocultar en la web».
                </p>
              )}
            </div>
          ) : (
            <details className="servicio__detalle">
              <summary>Ver qué incluye</summary>
              <p>{servicio.descripcion}</p>
              {servicio.incluye.length > 0 && (
                <ul role="list">
                  {servicio.incluye.map((item, i) => (
                    <li key={`${String(i)}-${item}`}>{item}</li>
                  ))}
                </ul>
              )}
            </details>
          )}
        </div>
      </article>
    </li>
  );
}
