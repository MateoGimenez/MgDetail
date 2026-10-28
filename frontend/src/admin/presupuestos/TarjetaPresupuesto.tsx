import { useId } from 'react';
import type { Presupuesto } from '../../api/presupuestos';
import { rutaPdfPresupuesto } from '../../api/presupuestos';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import { nombreDeArchivoPresupuesto } from '../../lib/comprobantes';
import { momentoEnLaRioja } from '../../lib/fechas';
import {
  ESTADOS_PRESUPUESTO,
  ETIQUETA_ESTADO_PRESUPUESTO,
  esEstadoPresupuesto,
  importeDeItem,
  mensajeDePresupuesto,
  textoDeVencimiento,
  textoItems,
  whatsappPresupuestoUrl,
  type EstadoPresupuesto,
} from '../../lib/presupuestos';
import { BotonesPdf } from '../documentos/BotonesPdf';

interface Props {
  presupuesto: Presupuesto;
  /** Nombre del taller para el texto de WhatsApp. */
  nombreTaller: string;
  ocupado: boolean;
  error: string | undefined;
  /** "Pasó a Aceptado. Sale de esta lista al actualizar." */
  aviso: string | null;
  alCambiarEstado: (estado: EstadoPresupuesto) => void;
  alEditar: () => void;
  alBorrar: () => void;
  alVencerSesion: (mensaje: string) => void;
}

/** Cada estado reusa el sello de los turnos: el texto manda, el color acompaña. */
const SELLO: Readonly<Record<EstadoPresupuesto, string>> = {
  borrador: 'sello--completado',
  enviado: 'sello--pendiente',
  aceptado: 'sello--confirmado',
  rechazado: 'sello--cancelado',
};

/** Un presupuesto: quién, cuánto, hasta cuándo, y lo que se hace con él (PDF, WhatsApp, editar, estado, borrar). */
export function TarjetaPresupuesto({
  presupuesto: p,
  nombreTaller,
  ocupado,
  error,
  aviso,
  alCambiarEstado,
  alEditar,
  alBorrar,
  alVencerSesion,
}: Props) {
  const id = useId();
  const whatsapp = whatsappPresupuestoUrl(p.clienteTelefono, mensajeDePresupuesto(p, nombreTaller));
  const vence = textoDeVencimiento(p);

  return (
    <li>
      <article className={`turno pres${p.vencido ? ' pres--vencido' : ''}`} aria-labelledby={`${id}-cliente`} aria-busy={ocupado}>
        <header className="turno__cabeza">
          <div className="turno__quien">
            <h3 id={`${id}-cliente`} className="turno__nombre">
              {p.clienteNombre}
            </h3>
            <span className="turno__ref">{p.codigo}</span>
          </div>
          <div className="pres__sellos">
            <span className={`sello ${SELLO[p.estado]}`}>{ETIQUETA_ESTADO_PRESUPUESTO[p.estado]}</span>
            {p.vencido && <span className="sello sello--cancelado">Vencido</span>}
          </div>
        </header>

        <dl className="turno__datos">
          <div className="pres__total">
            <dt>Total</dt>
            <dd>
              {formatoPesos(p.total)}
              {p.descuento > 0 && <span className="pres__descuento"> con {formatoPesos(Math.min(p.descuento, p.subtotal))} de descuento</span>}
            </dd>
          </div>
          {p.vehiculo && (
            <div>
              <dt>Vehículo</dt>
              <dd>{p.vehiculo}</dd>
            </div>
          )}
          <div>
            <dt>Armado el</dt>
            <dd>{momentoEnLaRioja(p.createdAt)}</dd>
          </div>
          {vence && (
            <div>
              <dt>Vigencia</dt>
              <dd className={p.vencido ? 'pres__vencio' : undefined}>{vence}</dd>
            </div>
          )}
        </dl>

        <details className="pres__items">
          <summary>
            Ver el detalle ({textoItems(p.items.length)})
            <Icono nombre="abajo" tamano={18} className="pres__flecha" />
          </summary>
          <ul className="pres__lista" role="list">
            {p.items.map((it, i) => (
              <li key={`${String(i)}-${it.descripcion}`} className="pres__renglon">
                <span className="pres__renglon-que">
                  {it.descripcion}
                  <span className="pres__renglon-cuenta">
                    {' '}
                    · {String(it.cantidad).replace('.', ',')} × {formatoPesos(it.precioUnitario)}
                  </span>
                </span>
                <span className="pres__renglon-importe">{formatoPesos(importeDeItem(it))}</span>
              </li>
            ))}
          </ul>
          {p.notas && <p className="pres__notas">Notas: {p.notas}</p>}
        </details>

        <p className="turno__aviso" role="status">
          {aviso && (
            <>
              <Icono nombre="check" tamano={18} />
              {aviso}
            </>
          )}
        </p>

        {error && (
          <p className="turno__error" role="alert">
            <Icono nombre="alerta" tamano={18} />
            {error}
          </p>
        )}

        <div className="turno__acciones pres__acciones">
          <BotonesPdf
            ruta={rutaPdfPresupuesto(p.id)}
            version={p.updatedAt}
            nombreDeArchivo={nombreDeArchivoPresupuesto(p.codigo)}
            queEs={`presupuesto ${p.codigo}`}
            alVencerSesion={alVencerSesion}
          />
          {whatsapp && (
            <div className="pres__whatsapp">
              <a className="boton boton--secundario boton--chico" href={whatsapp} target="_blank" rel="noopener noreferrer">
                <Icono nombre="whatsapp" tamano={18} />
                Avisar por WhatsApp
              </a>
              <p className="pres__whatsapp-ayuda">Abre el chat con el mensaje listo. El PDF se manda aparte: descargalo o compartilo.</p>
            </div>
          )}
        </div>

        <div className="turno__extra pres__extra">
          <button type="button" className="boton boton--fantasma boton--chico" disabled={ocupado} onClick={alEditar}>
            <Icono nombre="lapiz" tamano={18} />
            Editar
          </button>
          <label className="visualmente-oculto" htmlFor={`${id}-estado`}>
            Cambiar el estado de {p.codigo}
          </label>
          <div className="desplegable turno__estado">
            <select
              id={`${id}-estado`}
              className="entrada"
              value={p.estado}
              disabled={ocupado}
              onChange={(e) => {
                const valor = e.target.value;
                if (esEstadoPresupuesto(valor) && valor !== p.estado) alCambiarEstado(valor);
              }}
            >
              {ESTADOS_PRESUPUESTO.map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETA_ESTADO_PRESUPUESTO[estado]}
                </option>
              ))}
            </select>
            <Icono nombre="abajo" tamano={18} className="desplegable__icono" />
          </div>
          <button type="button" className="boton boton--fantasma boton--chico turno__eliminar" disabled={ocupado} onClick={alBorrar}>
            <Icono nombre="papelera" tamano={18} />
            Borrar
          </button>
        </div>
      </article>
    </li>
  );
}
