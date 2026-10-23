import { useId } from 'react';
import type { ServicioPanel } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { textoPrecio } from '../data/servicios';
import { idBajar, idSubir } from './useServicios';

interface Props {
  servicio: ServicioPanel;
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
  alCambiarDestacado: () => void;
  alCambiarActivo: () => void;
}


const cantidad = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${String(n)} ${varios}`);

/** Un servicio del catálogo: puesto (con subir y bajar), datos que se ven en la web, sellos y acciones. */
export function FilaServicio({
  servicio,
  puesto,
  total,
  editable,
  ocupado,
  ordenando,
  error,
  alSubir,
  alBajar,
  alEditar,
  alCambiarDestacado,
  alCambiarActivo,
}: Props) {
  const id = useId();
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
            <div>
              <dt>Precio</dt>
              <dd className={servicio.precioDesde === null ? 'servicio__consulta' : undefined}>
                {textoPrecio(servicio.precioDesde)}
              </dd>
            </div>
            <div>
              <dt>Duración</dt>
              <dd className={servicio.duracion === null ? 'servicio__consulta' : undefined}>
                {servicio.duracion ?? 'Sin cargar'}
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
                    Desactivar
                  </>
                ) : (
                  <>
                    <Icono nombre="ojo" tamano={18} />
                    Activar
                  </>
                )}
              </button>
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
