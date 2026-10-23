import { useId } from 'react';
import { ESTADOS, ETIQUETA_ESTADO, ETIQUETA_FRANJA, ETIQUETA_VEHICULO, FRANJA_EN_FRASE, esEstado, type Estado, type Turno } from '../api/contract';
import { type Rol } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { whatsappClienteUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';
import { fechaCorta, fechaLarga, momentoEnLaRioja } from '../lib/fechas';
import { referenciaDeTurno } from '../lib/turnos';
import { accionesDeEstado, muestraSelectorDeEstado, puedeBorrarTurnos } from './permisos';

interface Props {
  turno: Turno;
  /** Rol de quien mira: esconde lo que no puede hacer (la regla real la aplica el backend). */
  rol: Rol;
  /** Nombre del servicio pedido, ya resuelto con el catálogo. */
  nombreServicio: string;
  nueva: boolean;
  cambiada: boolean;
  /** Estado nuevo (legible) si el turno ya no corresponde a la pestaña abierta. */
  salioDelFiltro: string | null;
  ocupada: boolean;
  error: string | undefined;
  alCambiarEstado: (estado: Estado) => void;
  alEliminar: () => void;
}

export function TarjetaTurno({ turno, rol, nombreServicio, nueva, cambiada, salioDelFiltro, ocupada, error, alCambiarEstado, alEliminar }: Props) {
  const id = useId();
  const servicio = nombreServicio;
  const primerNombre = turno.nombre.trim().split(/\s+/)[0] ?? turno.nombre;
  const mensaje = `¡Hola ${primerNombre}! Te escribimos de ${negocio.nombre} por tu pedido de turno: ${servicio}, el ${fechaLarga(turno.fechaPreferida)} ${FRANJA_EN_FRASE[turno.franja]}.`;
  const whatsapp = whatsappClienteUrl(turno.telefonoWhatsapp, mensaje);
  const vehiculo = [ETIQUETA_VEHICULO[turno.vehiculoTipo], turno.vehiculoModelo].filter(Boolean).join(' · ');

  return (
    <article
      className={['turno', `turno--${turno.estado}`, cambiada ? 'turno--cambiada' : ''].filter(Boolean).join(' ')}
      aria-labelledby={`${id}-nombre`}
      aria-busy={ocupada}
    >
      <header className="turno__cabeza">
        <div className="turno__quien">
          <h3 id={`${id}-nombre`} className="turno__nombre">
            {turno.nombre}
          </h3>
          {nueva && <span className="turno__nueva">Nueva</span>}
          <span className="turno__ref">#{referenciaDeTurno(turno.id)}</span>
        </div>
        <span className={`sello sello--${turno.estado}`}>{ETIQUETA_ESTADO[turno.estado]}</span>
      </header>

      <dl className="turno__datos">
        <div>
          <dt>Servicio</dt>
          <dd>{servicio}</dd>
        </div>
        <div>
          <dt>Vehículo</dt>
          <dd>{vehiculo}</dd>
        </div>
        <div>
          <dt>Fecha preferida</dt>
          <dd>
            {fechaCorta(turno.fechaPreferida)} · {ETIQUETA_FRANJA[turno.franja]}
          </dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>
            <a href={`tel:${turno.telefono.replace(/[^\d+]/g, '')}`}>{turno.telefono}</a>
          </dd>
        </div>
        {turno.email && (
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${turno.email}`}>{turno.email}</a>
            </dd>
          </div>
        )}
        <div>
          <dt>Pedido el</dt>
          <dd>{momentoEnLaRioja(turno.createdAt)}</dd>
        </div>
      </dl>

      {turno.comentario && (
        <div className="turno__comentario">
          <p className="turno__comentario-titulo">Comentario</p>
          <p className="turno__comentario-texto">{turno.comentario}</p>
        </div>
      )}

      <p className="turno__aviso" role="status">
        {salioDelFiltro && (
          <>
            <Icono nombre="check" tamano={18} />
            Pasó a {salioDelFiltro}. Sale de esta lista al actualizar.
          </>
        )}
      </p>

      {error && (
        <p className="turno__error" role="alert">
          <Icono nombre="alerta" tamano={18} />
          {error}
        </p>
      )}

      <div className="turno__acciones">
        {accionesDeEstado(rol, turno.estado).map((transicion) => (
          <button
            key={transicion.a}
            type="button"
            className={transicion.principal ? 'boton boton--primario boton--chico' : 'boton boton--secundario boton--chico'}
            disabled={ocupada}
            onClick={() => {
              alCambiarEstado(transicion.a);
            }}
          >
            {transicion.principal && <Icono nombre="check" tamano={18} />}
            {transicion.texto}
          </button>
        ))}

        {whatsapp && (
          <a className="boton boton--secundario boton--chico" href={whatsapp} target="_blank" rel="noopener noreferrer">
            <Icono nombre="whatsapp" tamano={18} />
            Escribir por WhatsApp
          </a>
        )}

        {(muestraSelectorDeEstado(rol) || puedeBorrarTurnos(rol)) && (
          <div className="turno__extra">
            {muestraSelectorDeEstado(rol) && (
              <>
                <label className="visualmente-oculto" htmlFor={`${id}-estado`}>
                  Cambiar estado de la solicitud de {turno.nombre}
                </label>
                <div className="desplegable turno__estado">
                  <select
                    id={`${id}-estado`}
                    className="entrada"
                    value={turno.estado}
                    disabled={ocupada}
                    onChange={(evento) => {
                      const valor = evento.target.value;
                      if (esEstado(valor) && valor !== turno.estado) alCambiarEstado(valor);
                    }}
                  >
                    {ESTADOS.map((estado) => (
                      <option key={estado} value={estado}>
                        {ETIQUETA_ESTADO[estado]}
                      </option>
                    ))}
                  </select>
                  <Icono nombre="abajo" tamano={18} className="desplegable__icono" />
                </div>
              </>
            )}
            {puedeBorrarTurnos(rol) && (
              <button
                type="button"
                className="boton boton--fantasma boton--chico turno__eliminar"
                disabled={ocupada}
                onClick={alEliminar}
              >
                <Icono nombre="papelera" tamano={18} />
                Eliminar
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
