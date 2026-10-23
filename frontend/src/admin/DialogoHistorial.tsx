import type { RefObject } from 'react';
import { ETIQUETA_ESTADO, ETIQUETA_FRANJA, ETIQUETA_VEHICULO, type Turno } from '../api/contract';
import { Icono } from '../components/Icono';
import { lugarEnAgenda } from '../lib/agenda';
import { fechaCorta } from '../lib/fechas';
import { referenciaDeTurno } from '../lib/turnos';
import { devolverFoco, selectorDeHistorial } from './foco';
import { useHistorial } from './useHistorial';

interface Props {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  /** Turno desde el que se abrió (queda marcado). null con el diálogo cerrado. */
  origen: Turno | null;
  nombreServicio: (id: string) => string;
  alVencerSesion: (mensaje: string) => void;
  alCerrar: () => void;
  /** Dónde va el foco si el botón "Ver historial" ya no está al cerrar (p. ej. el título de la vista). */
  respaldoFoco?: RefObject<HTMLElement | null>;
}

/**
 * Historial del cliente en un <dialog> modal: todos los turnos con el mismo WhatsApp, más nuevos primero, con fecha
 * de agenda, servicio, vehículo, estado y nota interna. Es de solo lectura; las acciones siguen en cada tarjeta.
 * Al cerrar, el navegador devuelve el foco a "Ver historial"; si ese botón ya no está, va al respaldo.
 */
export function DialogoHistorial({ dialogoRef, origen, nombreServicio, alVencerSesion, alCerrar, respaldoFoco }: Props) {
  return (
    <dialog
      ref={dialogoRef}
      className="confirmar historial"
      aria-labelledby="historial-titulo"
      onClose={() => {
        const id = origen?.id ?? null;
        alCerrar();
        if (id === null) return;
        requestAnimationFrame(() => {
          const activo = document.activeElement;
          devolverFoco(
            document,
            selectorDeHistorial(id),
            respaldoFoco?.current ?? null,
            activo === null || activo === document.body || !activo.isConnected,
          );
        });
      }}
    >
      <div className="historial__barra">
        <h2 id="historial-titulo" className="historial__titulo">
          {origen ? `Historial de ${origen.nombre}` : 'Historial del cliente'}
        </h2>
        <button
          type="button"
          className="boton-icono"
          aria-label="Cerrar el historial"
          onClick={() => dialogoRef.current?.close()}
        >
          <Icono nombre="cerrar" tamano={20} />
        </button>
      </div>
      {origen?.telefonoWhatsapp && (
        <ListaHistorial
          key={`${origen.id}|${origen.telefonoWhatsapp}`}
          origen={origen}
          cliente={origen.telefonoWhatsapp}
          nombreServicio={nombreServicio}
          alVencerSesion={alVencerSesion}
        />
      )}
    </dialog>
  );
}

interface PropsLista {
  origen: Turno;
  cliente: string;
  nombreServicio: (id: string) => string;
  alVencerSesion: (mensaje: string) => void;
}

function ListaHistorial({ origen, cliente, nombreServicio, alVencerSesion }: PropsLista) {
  const h = useHistorial(cliente, alVencerSesion);

  const resumen =
    h.total === null
      ? ''
      : h.total === 1
        ? `1 turno con el teléfono ${origen.telefono}`
        : h.turnos.length < h.total
          ? `Mostrando ${String(h.turnos.length)} de ${String(h.total)} turnos con el teléfono ${origen.telefono}`
          : `${String(h.total)} turnos con el teléfono ${origen.telefono}`;

  return (
    <div className="historial__cuerpo">
      <p className="historial__resumen" aria-live="polite">
        {h.cargando ? 'Cargando el historial…' : resumen}
      </p>

      {h.cargando && (
        <div className="historial__lista" aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <div key={n} className="historial__item historial__item--esqueleto" />
          ))}
        </div>
      )}

      {h.error && (
        <div className="panel__error historial__error" role="alert">
          <Icono nombre="alerta" tamano={22} />
          <div>
            <p>No pudimos cargar el historial. {h.error}</p>
            <button type="button" className="boton boton--primario boton--chico" onClick={h.reintentar}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {h.turnos.length > 0 && (
        <ol className="historial__lista" role="list">
          {h.turnos.map((turno) => {
            const lugar = lugarEnAgenda(turno);
            const esOrigen = turno.id === origen.id;
            const vehiculo = [ETIQUETA_VEHICULO[turno.vehiculoTipo], turno.vehiculoModelo].filter(Boolean).join(' · ');
            return (
              <li
                key={turno.id}
                className={esOrigen ? 'historial__item historial__item--origen' : 'historial__item'}
                aria-current={esOrigen ? 'true' : undefined}
              >
                <div className="historial__fila">
                  <p className="historial__cuando">
                    {fechaCorta(lugar.fecha)} · {ETIQUETA_FRANJA[lugar.franja]}
                  </p>
                  <span className={`sello sello--chico sello--${turno.estado}`}>{ETIQUETA_ESTADO[turno.estado]}</span>
                </div>
                <p className="historial__que">
                  {nombreServicio(turno.servicioId)}
                  <span className="historial__vehiculo"> · {vehiculo}</span>
                </p>
                <p className="historial__ref">
                  #{referenciaDeTurno(turno.id)}
                  {esOrigen && <span className="historial__este">Este turno</span>}
                </p>
                {turno.notasInternas && (
                  <div className="historial__nota">
                    <p className="historial__nota-titulo">Nota interna</p>
                    <p className="historial__nota-texto">{turno.notasInternas}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {h.errorMas && (
        <p className="turno__error historial__error-mas" role="alert">
          <Icono nombre="alerta" tamano={18} />
          No pudimos traer los anteriores. {h.errorMas}
        </p>
      )}

      {(h.hayMas || h.cargandoMas || h.errorMas) && (
        <div className="historial__mas">
          <button
            type="button"
            className="boton boton--secundario boton--chico"
            disabled={h.cargandoMas}
            onClick={() => {
              if (h.errorMas) h.reintentar();
              else h.verMas();
            }}
          >
            {h.cargandoMas ? 'Cargando…' : h.errorMas ? 'Reintentar' : 'Ver turnos anteriores'}
          </button>
        </div>
      )}
    </div>
  );
}
