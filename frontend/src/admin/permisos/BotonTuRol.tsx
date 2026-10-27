import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ETIQUETA_ROL, type Rol } from '../../api/contract-panel';
import { Icono } from '../../components/Icono';
import { nombreDeRol, rolDe } from '../../lib/permisosRol';
import { ResumenDeRol } from './ResumenDeRol';
import { usePermisos } from './usePermisos';
import './permisos.css';

interface Props {
  rol: Rol;
  alVencerSesion: (mensaje: string) => void;
}

/** El contenido solo existe mientras el diálogo está abierto: así los permisos se piden al abrirlo y están al día. */
function Contenido({ rol, alVencerSesion, alCerrar }: Props & { alCerrar: () => void }) {
  const p = usePermisos(alVencerSesion);
  const id = useId();
  const permisos = p.permisos;
  const rolActual = permisos?.tuRol ?? rol;
  const descripcion = permisos ? rolDe(permisos, rolActual)?.descripcion : null;

  return (
    <>
      <h2 id="tu-rol-titulo" className="confirmar__titulo">
        Tu rol: {permisos ? nombreDeRol(permisos, rolActual) : ETIQUETA_ROL[rol]}
      </h2>

      <div aria-live="polite" aria-busy={p.cargando}>
        {p.cargando && <p className="dialogo-rol__estado">Cargando lo que podés hacer…</p>}
      </div>

      {p.error && (
        <div className="panel__error" role="alert">
          <Icono nombre="alerta" tamano={22} />
          <div>
            <p>No pudimos cargar tus permisos. {p.error}</p>
            <button type="button" className="boton boton--primario boton--chico" onClick={p.reintentar}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {permisos && (
        <>
          {descripcion && (
            <p id={`${id}-descripcion`} className="dialogo-rol__descripcion">
              {descripcion}
            </p>
          )}
          <ResumenDeRol permisos={permisos} rol={rolActual} persona="tu" />
        </>
      )}

      <div className="confirmar__acciones">
        <button type="button" className="boton boton--primario" onClick={alCerrar}>
          Entendido
        </button>
      </div>
    </>
  );
}

/**
 * El rol del encabezado, como botón: al tocarlo abre "Tu rol: Empleado" con lo que podés y no podés hacer. Sirve para
 * cualquier persona. Devuelve el botón y su <dialog> (el que lo contiene no puede ser un <p>).
 */
export function BotonTuRol({ rol, alVencerSesion }: Props) {
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const [abierto, setAbierto] = useState(false);
  // El diálogo se dibuja dentro de `.panel` y no dentro del encabezado oscuro: si no, hereda su color de texto claro y
  // se lee blanco sobre blanco (mismo criterio que el diálogo de Ajustes de la app).
  const [anfitrion, setAnfitrion] = useState<Element | null>(null);

  return (
    <>
      <button
        type="button"
        className="panel__rol"
        aria-haspopup="dialog"
        aria-label={`Tu rol: ${ETIQUETA_ROL[rol]}. Ver qué podés hacer`}
        ref={(boton) => {
          setAnfitrion(boton?.closest('.panel') ?? null);
        }}
        onClick={() => {
          setAbierto(true);
          dialogoRef.current?.showModal();
        }}
      >
        {ETIQUETA_ROL[rol]}
      </button>
      {anfitrion &&
        createPortal(
          <dialog
            ref={dialogoRef}
            className="confirmar dialogo-rol"
            aria-labelledby="tu-rol-titulo"
            onClose={() => {
              setAbierto(false);
            }}
          >
            {abierto && (
              <Contenido
                rol={rol}
                alVencerSesion={alVencerSesion}
                alCerrar={() => {
                  dialogoRef.current?.close();
                }}
              />
            )}
          </dialog>,
          anfitrion,
        )}
    </>
  );
}
