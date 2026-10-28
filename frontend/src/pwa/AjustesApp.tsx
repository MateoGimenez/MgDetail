import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icono } from '../components/Icono';
import { FilaPerfil } from '../admin/navegacion/FilaPerfil';
import { bloquearEscape } from '../admin/dialogo';
import { actualizarGlobito, reconfirmarAvisos } from './avisos';
import { useAjustes, type Ajustes } from './useAjustes';
import './ajustes.css';

/** Campana de los ajustes (el set de íconos del sitio no tiene una): mismo trazo, grilla de 24. */
function IconoCampana() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5ZM10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

interface Props {
  alVencerSesion: (mensaje: string) => void;
  /** Quién está logueado: los avisos del dispositivo quedan atados a esa persona. */
  usuarioId: string;
}

/**
 * Fila "Ajustes de la app" del menú de perfil (con su campana) + diálogo "Ajustes de la app" (instalar y avisos de turnos nuevos).
 * El diálogo se dibuja dentro de `.panel` para heredar la paleta clara del panel.
 */
export function BotonAjustes({ alVencerSesion, usuarioId }: Props) {
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const [anfitrion, setAnfitrion] = useState<Element | null>(null);
  const ajustes = useAjustes(alVencerSesion, usuarioId);

  // Al cargar el panel: si este dispositivo ya tenía avisos, se vuelven a registrar (la clave pudo cambiar) y
  // el globito del ícono se pone al día con los pendientes. Todo en silencio: son extras.
  useEffect(() => {
    reconfirmarAvisos(usuarioId).catch(() => undefined);
    void actualizarGlobito();
  }, [usuarioId]);

  return (
    <>
      <button
        type="button"
        className="perfil__fila"
        aria-haspopup="dialog"
        ref={(boton) => {
          setAnfitrion(boton?.closest('.panel') ?? null);
        }}
        onClick={() => {
          ajustes.abrir();
          dialogoRef.current?.showModal();
        }}
      >
        <FilaPerfil
          icono={<IconoCampana />}
          titulo="Ajustes de la app"
          detalle="Instalarla y avisos de turnos nuevos"
        />
      </button>
      {anfitrion && createPortal(<DialogoAjustes dialogoRef={dialogoRef} ajustes={ajustes} />, anfitrion)}
    </>
  );
}

function DialogoAjustes({
  dialogoRef,
  ajustes,
}: {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  ajustes: Ajustes;
}) {
  const ocupado = ajustes.ocupado !== null;
  return (
    <dialog
      ref={dialogoRef}
      className="confirmar ajustes"
      aria-labelledby="ajustes-titulo"
      onCancel={bloquearEscape(ocupado)}
      onClose={ajustes.cerrar}
    >
      <h2 id="ajustes-titulo" className="confirmar__titulo">
        Ajustes de la app
      </h2>

      {ajustes.instalacion !== 'oculto' && <SeccionInstalar ajustes={ajustes} />}
      {ajustes.avisos.tipo !== 'oculto' && <SeccionAvisos ajustes={ajustes} />}

      <div className="ajustes__nota" role="status">
        {ajustes.nota}
      </div>

      <div className="confirmar__acciones">
        <button
          type="button"
          className="boton boton--secundario"
          onClick={() => {
            dialogoRef.current?.close();
          }}
        >
          Cerrar
        </button>
      </div>
    </dialog>
  );
}

function SeccionInstalar({ ajustes }: { ajustes: Ajustes }) {
  const titulo = useId();
  return (
    <section className="ajustes__seccion" aria-labelledby={titulo}>
      <h3 id={titulo} className="ajustes__titulo">
        Instalar la app
      </h3>
      <p className="ajustes__texto">
        Tené el panel como una app más del celular: con su ícono, sin la barra del navegador y lista para los avisos.
      </p>
      {ajustes.instalacion === 'boton' && (
        <button
          type="button"
          className="boton boton--primario ajustes__accion"
          disabled={ajustes.ocupado === 'instalando'}
          onClick={() => {
            void ajustes.instalar();
          }}
        >
          Instalar la app
        </button>
      )}
      {ajustes.instalacion === 'ios' && (
        <ol className="ajustes__pasos">
          <li>
            Tocá <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba) en la barra de Safari.
          </li>
          <li>
            Elegí <strong>Agregar a inicio</strong>.
          </li>
          <li>
            Tocá <strong>Agregar</strong> y abrí el panel desde el ícono nuevo.
          </li>
        </ol>
      )}
      {ajustes.instalacion === 'menu' && (
        <p className="ajustes__texto">
          Tu navegador no ofrece el botón de instalar desde acá. Buscá <strong>Instalar app</strong> o{' '}
          <strong>Agregar a la pantalla de inicio</strong> en su menú.
        </p>
      )}
    </section>
  );
}

function SeccionAvisos({ ajustes }: { ajustes: Ajustes }) {
  const titulo = useId();
  const ayuda = useId();
  const { avisos } = ajustes;
  const conInterruptor =
    avisos.tipo === 'inactivo' ||
    avisos.tipo === 'activo' ||
    avisos.tipo === 'cargando' ||
    (avisos.tipo === 'error' && !ajustes.sinServidor);
  const ocupado = ajustes.ocupado !== null;

  return (
    <section className="ajustes__seccion" aria-labelledby={titulo}>
      <h3 id={titulo} className="ajustes__titulo">
        Avisos de turnos nuevos
      </h3>

      {conInterruptor && (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={ajustes.encendido}
            aria-describedby={ayuda}
            className="ajustes__interruptor"
            disabled={ocupado || avisos.tipo === 'cargando'}
            onClick={() => {
              void ajustes.alternarAvisos();
            }}
          >
            <span className="ajustes__interruptor-texto">Avisarme de turnos nuevos</span>
            <span className="ajustes__pista" aria-hidden="true">
              <span className="ajustes__perilla">
                <Icono nombre="check" tamano={14} />
              </span>
            </span>
          </button>
          <p id={ayuda} className="ajustes__texto">
            {avisos.tipo === 'cargando'
              ? 'Mirando cómo está este dispositivo…'
              : ajustes.ocupado === 'activando'
                ? 'Activando los avisos…'
                : ajustes.ocupado === 'desactivando'
                  ? 'Apagando los avisos…'
                  : ajustes.encendido
                    ? 'Activados en este dispositivo. Te llega un aviso cuando entra un turno, sin nombres ni datos del cliente.'
                    : 'Te llega un aviso al celular cuando entra un turno, sin nombres ni datos del cliente. Se activan solo en este dispositivo.'}
          </p>
        </>
      )}

      {avisos.tipo === 'error' && (
        <div className="ajustes__error" role="alert">
          <Icono nombre="alerta" tamano={18} />
          <span>{avisos.mensaje}</span>
          <button
            type="button"
            className="boton boton--secundario boton--chico"
            disabled={ocupado}
            onClick={() => {
              void ajustes.reintentar();
            }}
          >
            <Icono nombre="refrescar" tamano={16} />
            Reintentar
          </button>
        </div>
      )}

      {avisos.tipo === 'instalar-primero' && (
        <p className="ajustes__texto">
          En iPhone y iPad los avisos funcionan solo con la app instalada. Instalala primero (<strong>Compartir</strong>{' '}
          → <strong>Agregar a inicio</strong>), abrí el panel desde el ícono nuevo y volvé acá para activarlos. Hace
          falta iOS 16.4 o más.
        </p>
      )}

      {avisos.tipo === 'sin-soporte' && (
        <p className="ajustes__texto">
          Este navegador no puede mostrar avisos. Probá con Chrome o Edge en Android o en la compu. Si estás en una
          pestaña privada, abrí el panel en una normal.
        </p>
      )}

      {avisos.tipo === 'bloqueado' && (
        <div className="ajustes__texto">
          <p>Bloqueaste las notificaciones de este sitio, por eso no podemos avisarte. Para desbloquearlas:</p>
          <ul className="ajustes__pasos ajustes__pasos--lista" role="list">
            <li>
              <strong>Android o computadora:</strong> tocá el candado (o el ícono de ajustes) al lado de la dirección →{' '}
              <strong>Permisos</strong> → <strong>Notificaciones</strong> → <strong>Permitir</strong>.
            </li>
            <li>
              <strong>iPhone o iPad:</strong> Ajustes del teléfono → <strong>Notificaciones</strong> → el panel →{' '}
              <strong>Permitir notificaciones</strong>.
            </li>
          </ul>
          <p>Después volvé a abrir esta pantalla.</p>
        </div>
      )}

      {ajustes.encendido && !ajustes.sinServidor && (avisos.tipo === 'activo' || avisos.tipo === 'error') && (
        <button
          type="button"
          className="boton boton--secundario boton--chico ajustes__accion"
          disabled={ocupado}
          onClick={() => {
            void ajustes.probar();
          }}
        >
          {ajustes.ocupado === 'probando' ? 'Mostrando…' : 'Probar aviso'}
        </button>
      )}
    </section>
  );
}
