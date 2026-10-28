import { useRef } from 'react';
import { ETIQUETA_ESTADO, ETIQUETA_FRANJA, ETIQUETA_VEHICULO, type Turno } from '../api/contract';
import type { Rol } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { lugarEnAgenda } from '../lib/agenda';
import { textoSinCobro } from '../lib/cobro';
import { textoLugares, textoLugaresLargo } from '../lib/cupos';
import { diaConMes, diaCortoConMes } from '../lib/fechas';
import {
  avisosDeHoy,
  haceCuanto,
  resumenDeManana,
  resumenDelDia,
  saludoSegunHora,
  textoPendientes,
  textoStockBajo,
  type FranjaDelDia,
} from '../lib/hoy';
import './cobro/cobro.css';
import { EsqueletoHoy } from './Esqueleto';
import { TarjetaDelMes } from './finanzas/TarjetaDelMes';
import { useStockBajo } from './finanzas/useStockBajo';
import { puedeRegistrarCobro, puedeVerFinanzas } from './permisos';
import type { PropsSeccion } from './secciones';
import { useHoy } from './useHoy';

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

interface Props {
  rol: Rol;
  /** Nombre (o email) de quien está conectado, para el saludo. */
  nombre: string | null;
  nombreServicio: (id: string) => string;
  alVencerSesion: (mensaje: string) => void;
  /** Lleva a otra vista del panel; `busqueda` abre Turnos con ese texto buscado. */
  irA: PropsSeccion['irA'];
}

/** Primer nombre para el saludo ("Mateo Giménez" → "Mateo"; de un email se usa lo de antes de la arroba). */
function primerNombre(nombre: string | null): string | null {
  if (!nombre) return null;
  const base = nombre.includes('@') ? (nombre.split('@')[0] ?? nombre) : nombre;
  return base.trim().split(/\s+/)[0] || null;
}

/**
 * Hoy: lo primero que ve el dueño al abrir el panel. Pendientes (con los que más esperan), los turnos de hoy por
 * franja con sus cupos, mañana y los avisos del día. Todos los roles ven lo mismo y no tiene controles de edición:
 * confirmar, completar o reprogramar se hace en Turnos y Agenda.
 */
export function VistaHoy({ rol, nombre, nombreServicio, alVencerSesion, irA }: Props) {
  const h = useHoy(alVencerSesion, puedeRegistrarCobro(rol));
  const conFinanzas = puedeVerFinanzas(rol);
  // Insumos con stock bajo: lo ven todos los roles; si Inventario no responde, simplemente no hay aviso.
  const stockBajo = useStockBajo(alVencerSesion, h.version);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const datos = h.datos;
  const quien = primerNombre(nombre);
  const saludo = datos ? saludoSegunHora(datos.ahora) : 'Hola';

  const dia = datos ? resumenDelDia(datos.turnos, datos.hoy, datos.cupos.get(datos.hoy)) : null;
  const manana = datos ? resumenDelDia(datos.turnos, datos.manana, datos.cupos.get(datos.manana)) : null;
  const avisos = dia ? avisosDeHoy(dia) : [];

  const filaDeHoy = (turno: Turno) => (
    <li key={turno.id} className="hoy__turno">
      <div className="hoy__turno-datos">
        <p className="hoy__turno-nombre">{turno.nombre}</p>
        <p className="hoy__turno-detalle">
          {nombreServicio(turno.servicioId)} · {ETIQUETA_VEHICULO[turno.vehiculoTipo]}
          {turno.vehiculoModelo ? ` ${turno.vehiculoModelo}` : ''}
        </p>
      </div>
      <span className={`sello sello--${turno.estado} sello--chico`}>{ETIQUETA_ESTADO[turno.estado]}</span>
    </li>
  );

  const franja = ({ franja: f, turnos, lugares }: FranjaDelDia) => (
    <div key={f} className={lugares?.llena ? 'hoy__franja hoy__franja--llena' : 'hoy__franja'}>
      <h3 className="hoy__franja-titulo">
        {ETIQUETA_FRANJA[f]}
        {lugares && (
          <span className="hoy__cupo">
            <span aria-hidden="true">{textoLugares(lugares)}</span>
            <span className="visualmente-oculto">{textoLugaresLargo(lugares)}</span>
          </span>
        )}
      </h3>
      {turnos.length > 0 ? (
        <ul role="list" className="hoy__turnos">
          {turnos.map(filaDeHoy)}
        </ul>
      ) : (
        <p className="hoy__libre">{lugares?.cerrada ? 'Cerrada.' : 'Nada agendado.'}</p>
      )}
    </div>
  );

  return (
    <section className="panel__vista hoy" aria-labelledby="titulo-hoy">
      <div className="panel__encabezado">
        <h1 id="titulo-hoy" ref={tituloRef} className="panel__titulo" tabIndex={-1}>
          {quien ? `${saludo}, ${quien}` : saludo}
        </h1>
        <button type="button" className="boton boton--secundario boton--chico" disabled={h.cargando} onClick={h.recargar}>
          <Icono nombre="refrescar" tamano={18} />
          Actualizar
        </button>
      </div>
      {datos && <p className="hoy__fecha">{conMayuscula(diaConMes(datos.hoy))}</p>}

      <div className="panel__estado" aria-live="polite">
        {h.cargando && <p className="panel__cargando">Cargando lo de hoy…</p>}
      </div>

      {h.cargando && <EsqueletoHoy />}

      {h.error && (
        <div className="panel__error" role="alert">
          <Icono nombre="alerta" tamano={22} />
          <div>
            <p>No pudimos cargar lo de hoy. {h.error}</p>
            <button type="button" className="boton boton--primario boton--chico" onClick={h.recargar}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {datos && dia && manana && (
        <>
          {datos.sinCobro && datos.sinCobro.cantidad > 0 && (
            <ul role="list" className="hoy__avisos">
              <li className="hoy__aviso hoy__aviso--cobro">
                <span className="hoy__aviso-texto">
                  <Icono nombre="alerta" tamano={18} />
                  {textoSinCobro(datos.sinCobro.cantidad, datos.sinCobro.aproximado)}
                </span>
                <button
                  type="button"
                  className="boton boton--secundario boton--chico"
                  onClick={() => {
                    irA('turnos', undefined, 'completado');
                  }}
                >
                  Cargar cobros
                  <Icono nombre="flecha" tamano={18} />
                </button>
              </li>
            </ul>
          )}

          {stockBajo > 0 && (
            <ul role="list" className="hoy__avisos">
              <li className="hoy__aviso hoy__aviso--cobro">
                <span className="hoy__aviso-texto">
                  <Icono nombre="alerta" tamano={18} />
                  {textoStockBajo(stockBajo)}
                </span>
                <button
                  type="button"
                  className="boton boton--secundario boton--chico"
                  onClick={() => {
                    irA('inventario', undefined, undefined, 'bajo-stock');
                  }}
                >
                  Ver el inventario
                  <Icono nombre="flecha" tamano={18} />
                </button>
              </li>
            </ul>
          )}

          {avisos.length > 0 && (
            <ul role="list" className="hoy__avisos">
              {avisos.map((aviso) => (
                <li key={aviso} className="hoy__aviso">
                  <Icono nombre="alerta" tamano={18} />
                  {aviso}
                </li>
              ))}
            </ul>
          )}

          {conFinanzas && (
            <div className="hoy__mes-fila">
              <TarjetaDelMes alVencerSesion={alVencerSesion} irA={irA} version={h.version} />
            </div>
          )}

          <div className="hoy__cuerpo">
            <section className="hoy__tarjeta hoy__pendientes" aria-labelledby="hoy-pendientes">
              <h2 id="hoy-pendientes" className="hoy__titulo">
                Pendientes
              </h2>
              {datos.pendientes === 0 ? (
                <p className="hoy__todo-al-dia">
                  <Icono nombre="check" tamano={22} />
                  No hay solicitudes por responder. Está todo al día.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className="hoy__pendientes-ir"
                    onClick={() => {
                      irA('turnos');
                    }}
                  >
                    <span className="hoy__pendientes-cantidad">{textoPendientes(datos.pendientes)}</span>
                    <span className="hoy__pendientes-ayuda">
                      {rol === 'empleado' ? 'Ver las solicitudes' : 'Confirmalas o cancelalas'}
                    </span>
                    <Icono nombre="flecha" tamano={22} className="hoy__pendientes-flecha" />
                  </button>
                  <h3 className="hoy__subtitulo">
                    {datos.viejos.length === 1 ? 'La que más espera' : `Las ${String(datos.viejos.length)} que más esperan`}
                  </h3>
                  <ul role="list" className="hoy__viejos">
                    {datos.viejos.map((turno) => {
                      const lugar = lugarEnAgenda(turno);
                      return (
                        <li key={turno.id} className="hoy__viejo">
                          <div className="hoy__turno-datos">
                            <p className="hoy__turno-nombre">{turno.nombre}</p>
                            <p className="hoy__turno-detalle">
                              {nombreServicio(turno.servicioId)} · {diaCortoConMes(lugar.fecha)} · {ETIQUETA_FRANJA[lugar.franja]}
                            </p>
                            <p className="hoy__turno-hace">Llegó {haceCuanto(turno.createdAt, datos.ahora)}</p>
                          </div>
                          <button
                            type="button"
                            className="boton boton--secundario boton--chico"
                            onClick={() => {
                              irA('turnos', turno.nombre.trim());
                            }}
                          >
                            Abrir
                            <span className="visualmente-oculto"> la solicitud de {turno.nombre}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>

            <section className="hoy__tarjeta hoy__hoy" aria-labelledby="hoy-hoy">
              <h2 id="hoy-hoy" className="hoy__titulo">
                Turnos de hoy
              </h2>
              {dia.total === 0 && dia.cerrado !== true ? (
                <p className="hoy__vacio">Hoy no hay turnos.</p>
              ) : (
                <div className="hoy__franjas">{dia.franjas.map(franja)}</div>
              )}
              <button
                type="button"
                className="boton boton--secundario boton--chico hoy__ver"
                onClick={() => {
                  irA('agenda');
                }}
              >
                <Icono nombre="calendario" tamano={18} />
                Ver la agenda
              </button>
            </section>

            <section className="hoy__tarjeta hoy__manana" aria-labelledby="hoy-manana">
              <h2 id="hoy-manana" className="hoy__titulo">
                Mañana
              </h2>
              <p className="hoy__manana-dia">{conMayuscula(diaConMes(datos.manana))}</p>
              <p className="hoy__manana-resumen">{resumenDeManana(manana)}</p>
              {manana.total > 0 && manana.cerrado !== true && (
                <p className="hoy__manana-franjas">
                  {manana.franjas
                    .filter((f) => f.turnos.length > 0)
                    .map((f) => `${ETIQUETA_FRANJA[f.franja]}: ${String(f.turnos.length)}`)
                    .join(' · ')}
                </p>
              )}
              <button
                type="button"
                className="boton boton--secundario boton--chico hoy__ver"
                onClick={() => {
                  irA('disponibilidad');
                }}
              >
                <Icono nombre="reloj" tamano={18} />
                {rol === 'empleado' ? 'Ver la disponibilidad' : 'Abrir o cerrar días'}
              </button>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
