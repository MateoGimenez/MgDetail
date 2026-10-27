import { useEffect, useId, useRef, useState } from 'react';
import {
  ESTADOS,
  ETIQUETA_ESTADO,
  ETIQUETA_FRANJA,
  ETIQUETA_VEHICULO,
  esEstado,
  type CambiosTurno,
  type Estado,
  type Turno,
} from '../api/contract';
import { type Rol } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { seguimientoPublicoUrl, whatsappClienteUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';
import { lugarEnAgenda, mensajeParaCliente, textoPidio } from '../lib/agenda';
import { faltaCobro, lineaDeCobro } from '../lib/cobro';
import { diaCortoConMes, fechaCorta, momentoEnLaRioja } from '../lib/fechas';
import { referenciaDeTurno, selloDeCliente } from '../lib/turnos';
import { FormularioCobro } from './cobro/FormularioCobro';
import { ElegirFecha, type ModoFecha } from './ElegirFecha';
import { NotaInterna } from './NotaInterna';
import {
  accionesDeEstado,
  admiteNuevaFecha,
  muestraSelectorDeEstado,
  puedeBorrarTurnos,
  puedeEditarNotas,
  puedeRegistrarCobro,
  puedeReprogramar,
} from './permisos';
import type { Problema } from './useUsuarios';

interface Props {
  turno: Turno;
  /** Rol de quien mira: esconde lo que no puede hacer (la regla real la aplica el backend). */
  rol: Rol;
  /** Nombre del servicio pedido, ya resuelto con el catálogo. */
  nombreServicio: string;
  nueva: boolean;
  cambiada: boolean;
  /** Aviso después de un cambio (p. ej. "Pasó a Confirmado. Sale de esta lista al actualizar."). */
  aviso: string | null;
  ocupada: boolean;
  error: string | undefined;
  /** Manda el cambio (estado, fecha confirmada, nota o varios juntos). null si salió bien. */
  alCambiar: (cambios: CambiosTurno) => Promise<Problema | null>;
  alEliminar: () => void;
  /** Abre el historial del cliente (solo se ofrece con 2 o más turnos). */
  alVerHistorial: () => void;
  /** id del nombre, para que un <dialog> que contiene la tarjeta lo use como título. */
  idTitulo?: string;
  /** En la lista es h3 (bajo el h1 de la vista); dentro del detalle de la agenda, h2. */
  nivelTitulo?: 2 | 3;
  /**
   * Solo en la lista de Turnos: la tarjeta se pliega en una fila compacta y la cabecera es el botón que la abre. El
   * estado lo guarda la vista por id de turno. Sin esto (agenda, historial) la tarjeta se ve completa, como siempre.
   */
  plegado?: Plegado;
}

export interface Plegado {
  expandida: boolean;
  alAlternar: () => void;
  /** Avisa si hay algo a medio escribir (nota en edición, elegir fecha), para que "Plegar todas" no lo esconda. */
  alCambiarBorrador: (abierto: boolean) => void;
}

export function TarjetaTurno({
  turno,
  rol,
  nombreServicio,
  nueva,
  cambiada,
  aviso,
  ocupada,
  error,
  alCambiar,
  alEliminar,
  alVerHistorial,
  idTitulo,
  nivelTitulo = 3,
  plegado,
}: Props) {
  const id = useId();
  const tituloId = idTitulo ?? `${id}-nombre`;
  const cuerpoId = `${id}-cuerpo`;
  const tarjetaRef = useRef<HTMLElement>(null);
  // Qué formulario está abierto en la tarjeta: elegir fecha, completar con cobro, o editar el cobro de un completado.
  const [formulario, setFormulario] = useState<ModoFecha | 'completar' | 'cobro' | null>(null);
  const [editandoNota, setEditandoNota] = useState(false);
  const Titulo = nivelTitulo === 2 ? 'h2' : 'h3';

  const servicio = nombreServicio;
  const lugar = lugarEnAgenda(turno);
  const reprograma = puedeReprogramar(rol);
  const registraCobro = puedeRegistrarCobro(rol);
  // El mensaje usa la fecha de agenda (la confirmada si existe, si no la que pidió) y, si la web tiene URL
  // pública, el enlace de seguimiento.
  const whatsapp = whatsappClienteUrl(
    turno.telefonoWhatsapp,
    mensajeParaCliente(turno, servicio, negocio.nombre, seguimientoPublicoUrl(turno.id)),
  );
  const vehiculo = [ETIQUETA_VEHICULO[turno.vehiculoTipo], turno.vehiculoModelo].filter(Boolean).join(' · ');
  const cliente = selloDeCliente(turno.turnosDelCliente);

  // Si el turno cambió por otro lado (p. ej. se canceló), el formulario que ya no corresponde se cierra solo.
  const abierto =
    formulario === 'confirmar'
      ? turno.estado === 'pendiente'
      : formulario === 'reprogramar'
        ? admiteNuevaFecha(turno.estado)
        : formulario === 'completar'
          ? turno.estado !== 'completado'
          : formulario === 'cobro'
            ? turno.estado === 'completado'
            : false;

  // Un formulario que ya no corresponde (el turno cambió por otro lado o recién se guardó) no queda armado para después.
  if (formulario !== null && !abierto) setFormulario(null);

  // Algo a medio escribir: la vista no lo pliega con "Plegar todas" (y plegar a mano solo lo oculta, no lo borra).
  const borrador = (abierto && formulario !== null) || editandoNota;
  const avisarRef = useRef(plegado?.alCambiarBorrador);
  useEffect(() => {
    avisarRef.current = plegado?.alCambiarBorrador;
  });
  useEffect(() => {
    const avisar = avisarRef.current;
    avisar?.(borrador);
    return () => {
      avisar?.(false);
    };
  }, [borrador]);

  const expandida = plegado ? plegado.expandida : true;
  const pidio = textoPidio(turno);

  const cerrarFormulario = () => {
    const modo = formulario;
    setFormulario(null);
    requestAnimationFrame(() => {
      // El foco vuelve al botón que abrió el formulario; si ya no está (se confirmó), a la primera acción.
      const tarjeta = tarjetaRef.current;
      // Al completar, el foco va a "Editar cobro" (no a Eliminar, que es la primera acción que queda).
      const boton =
        tarjeta?.querySelector<HTMLElement>(`[data-abre="${modo ?? ''}"]`) ??
        (modo === 'completar' ? tarjeta?.querySelector<HTMLElement>('[data-abre="cobro"]') : null) ??
        tarjeta?.querySelector<HTMLElement>('.turno__acciones button, .turno__acciones a');
      boton?.focus();
    });
  };

  const aplicar = (estado: Estado) => {
    // Desde "pendiente", confirmar pregunta para cuándo (si el rol puede elegir otra fecha).
    if (estado === 'confirmado' && reprograma && turno.estado === 'pendiente') {
      setFormulario('confirmar');
      return;
    }
    // Completar pregunta cuánto se cobró y quién lo hizo (el empleado completa directo: no maneja plata).
    if (estado === 'completado' && registraCobro) {
      setFormulario('completar');
      return;
    }
    void alCambiar({ estado });
  };

  const sello = <span className={`sello sello--${turno.estado}`}>{ETIQUETA_ESTADO[turno.estado]}</span>;
  const marcas = (
    <>
      {nueva && <span className="turno__nueva">Nueva</span>}
      <span className="turno__ref">#{referenciaDeTurno(turno.id)}</span>
    </>
  );

  const contenido = (
    <>
      <dl className="turno__datos">
        <div>
          <dt>Servicio</dt>
          <dd>{servicio}</dd>
        </div>
        <div>
          <dt>Vehículo</dt>
          <dd>{vehiculo}</dd>
        </div>
        {lugar.reprogramado ? (
          <div>
            <dt>Turno para</dt>
            <dd>
              {fechaCorta(lugar.fecha)} · {ETIQUETA_FRANJA[lugar.franja]}
              <span className="turno__pidio">
                Pidió: {fechaCorta(turno.fechaPreferida)} · {ETIQUETA_FRANJA[turno.franja]}
              </span>
            </dd>
          </div>
        ) : (
          <div>
            <dt>Fecha preferida</dt>
            <dd>
              {fechaCorta(turno.fechaPreferida)} · {ETIQUETA_FRANJA[turno.franja]}
            </dd>
          </div>
        )}
        <div>
          <dt>Teléfono</dt>
          <dd>
            <a href={`tel:${turno.telefono.replace(/[^\d+]/g, '')}`}>{turno.telefono}</a>
          </dd>
        </div>
        {cliente && (
          <div>
            <dt>Cliente</dt>
            <dd className="turno__cliente">
              <span className={cliente.conHistorial ? 'sello-cliente sello-cliente--frecuente' : 'sello-cliente'}>
                {cliente.conHistorial && <Icono nombre="estrella" tamano={14} />}
                {cliente.texto}
              </span>
              {cliente.conHistorial && (
                <button
                  type="button"
                  className="turno__historial"
                  data-historial={turno.id}
                  aria-haspopup="dialog"
                  onClick={alVerHistorial}
                >
                  <Icono nombre="historial" tamano={18} />
                  Ver historial
                </button>
              )}
            </dd>
          </div>
        )}
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

      {turno.estado === 'completado' &&
        (abierto && formulario === 'cobro' ? (
          <FormularioCobro turno={turno} modo="editar" alEnviar={alCambiar} alTerminar={cerrarFormulario} />
        ) : (
          <CobroDelTurno
            turno={turno}
            verImportes={registraCobro}
            ocupada={ocupada}
            alEditar={
              registraCobro
                ? () => {
                    setFormulario('cobro');
                  }
                : undefined
            }
          />
        ))}

      {puedeEditarNotas(rol) ? (
        <NotaInterna
          nota={turno.notasInternas}
          ocupada={ocupada}
          alGuardar={alCambiar}
          alCambiarEdicion={setEditandoNota}
        />
      ) : (
        turno.notasInternas && (
          <div className="nota">
            <p className="nota__titulo">Nota interna</p>
            <p className="nota__texto">{turno.notasInternas}</p>
          </div>
        )
      )}

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

      {abierto && (formulario === 'confirmar' || formulario === 'reprogramar') ? (
        <ElegirFecha turno={turno} modo={formulario} alEnviar={alCambiar} alTerminar={cerrarFormulario} />
      ) : abierto && formulario === 'completar' ? (
        <FormularioCobro turno={turno} modo="completar" alEnviar={alCambiar} alTerminar={cerrarFormulario} />
      ) : (
        <div className="turno__acciones">
          {accionesDeEstado(rol, turno.estado).map((transicion) => (
            <button
              key={transicion.a}
              type="button"
              className={transicion.principal ? 'boton boton--primario boton--chico' : 'boton boton--secundario boton--chico'}
              disabled={ocupada}
              data-abre={transicion.a === 'confirmado' ? 'confirmar' : transicion.a === 'completado' ? 'completar' : undefined}
              onClick={() => {
                aplicar(transicion.a);
              }}
            >
              {transicion.principal && <Icono nombre="check" tamano={18} />}
              {transicion.texto}
            </button>
          ))}

          {reprograma && admiteNuevaFecha(turno.estado) && (
            <button
              type="button"
              className="boton boton--secundario boton--chico"
              disabled={ocupada}
              data-abre="reprogramar"
              onClick={() => {
                setFormulario('reprogramar');
              }}
            >
              <Icono nombre="calendario" tamano={18} />
              Reprogramar
            </button>
          )}

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
                        if (esEstado(valor) && valor !== turno.estado) aplicar(valor);
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
      )}
    </>
  );

  const clases = ['turno', `turno--${turno.estado}`, cambiada ? 'turno--cambiada' : ''];

  if (!plegado) {
    return (
      <article
        ref={tarjetaRef}
        className={clases.filter(Boolean).join(' ')}
        aria-labelledby={tituloId}
        aria-busy={ocupada}
      >
        <header className="turno__cabeza">
          <div className="turno__quien">
            <Titulo id={tituloId} className="turno__nombre">
              {turno.nombre}
            </Titulo>
            {marcas}
          </div>
          {sello}
        </header>
        {contenido}
      </article>
    );
  }

  // Señales de la fila plegada: lo que conviene saber sin abrirla.
  const frecuente = cliente?.conHistorial === true;
  const conNota = Boolean(turno.notasInternas);
  const sinCobro = registraCobro && faltaCobro(turno);
  const senales = !expandida && (frecuente || conNota || borrador || sinCobro || Boolean(error));

  return (
    <article
      ref={tarjetaRef}
      className={[...clases, 'turno--plegable', expandida ? '' : 'turno--plegada'].filter(Boolean).join(' ')}
      aria-labelledby={tituloId}
      aria-busy={ocupada}
    >
      {/* Patrón acordeón: el título contiene el botón; todo lo de la fila plegada es su texto. */}
      <Titulo className="turno__titulo">
        <button
          type="button"
          className="turno__resumen"
          aria-expanded={expandida}
          aria-controls={cuerpoId}
          onClick={plegado.alAlternar}
        >
          <span className="turno__cabeza">
            <span className="turno__quien">
              <span id={tituloId} className="turno__nombre">
                {turno.nombre}
              </span>
              {marcas}
            </span>
            <span className="turno__estado-flecha">
              {sello}
              <Icono nombre="abajo" tamano={20} className="turno__flecha" />
            </span>
          </span>
          {!expandida && (
            <span className="turno__breve">
              <span className="turno__breve-linea">
                <span>{servicio}</span>
                <span className="turno__breve-fecha">
                  {diaCortoConMes(lugar.fecha)} · {ETIQUETA_FRANJA[lugar.franja]}
                </span>
                {pidio && <span className="turno__breve-pidio">{pidio}</span>}
              </span>
              {senales && (
                <span className="turno__senales">
                  {error && (
                    <span className="senal senal--error">
                      <Icono nombre="alerta" tamano={14} />
                      No se guardó
                    </span>
                  )}
                  {borrador && (
                    <span className="senal senal--borrador">
                      <Icono nombre="reloj" tamano={14} />
                      Sin terminar
                    </span>
                  )}
                  {sinCobro && (
                    <span className="senal senal--sincobro">
                      <Icono nombre="alerta" tamano={14} />
                      Sin cobro
                    </span>
                  )}
                  {frecuente && (
                    <span className="senal senal--frecuente">
                      <Icono nombre="estrella" tamano={14} />
                      Frecuente
                    </span>
                  )}
                  {conNota && (
                    <span className="senal">
                      <Icono nombre="lapiz" tamano={14} />
                      Nota
                    </span>
                  )}
                </span>
              )}
            </span>
          )}
        </button>
      </Titulo>
      {/* Plegado solo oculta (no desmonta): una nota o una fecha a medio elegir siguen ahí al volver a abrir. */}
      <div id={cuerpoId} className="turno__cuerpo" inert={!expandida}>
        <div className="turno__cuerpo-recorte">
          <div className="turno__cuerpo-contenido">{contenido}</div>
        </div>
      </div>
    </article>
  );
}

/**
 * Cobro de un turno completado: "Cobrado $ 60.000 · Lucas" o "Sin cobro cargado", con el botón para cargarlo o
 * corregirlo (solo admin y superadmin). El empleado ve solo quién lo hizo: nunca recibe importes.
 */
function CobroDelTurno({
  turno,
  verImportes,
  ocupada,
  alEditar,
}: {
  turno: Turno;
  verImportes: boolean;
  ocupada: boolean;
  alEditar: (() => void) | undefined;
}) {
  const linea = lineaDeCobro(turno, verImportes);
  if (!linea) return null;
  const falta = verImportes && faltaCobro(turno);
  return (
    <div className={falta ? 'cobro-resumen cobro-resumen--falta' : 'cobro-resumen'}>
      <p className="cobro-resumen__texto">
        <span className="cobro-resumen__titulo">
          Cobro
        </span>
        {falta && <Icono nombre="alerta" tamano={16} />}
        <span>{linea}</span>
      </p>
      {alEditar && (
        <button
          type="button"
          className="boton boton--fantasma boton--chico"
          disabled={ocupada}
          data-abre="cobro"
          onClick={alEditar}
        >
          <Icono nombre={falta ? 'mas' : 'lapiz'} tamano={18} />
          {turno.monto === null ? 'Cargar cobro' : 'Editar cobro'}
        </button>
      )}
    </div>
  );
}
