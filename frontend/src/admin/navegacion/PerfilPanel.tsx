import { useId } from 'react';
import { ETIQUETA_ROL, type Rol } from '../../api/contract-panel';
import { Icono } from '../../components/Icono';
import { BotonAjustes } from '../../pwa/AjustesApp';
import { BotonTuRol } from '../permisos/BotonTuRol';
import { Hoja } from './Hoja';
import { iniciales } from './iniciales';

/** El avatar del encabezado: lo único que el panel muestra de la persona. Abre el menú de perfil. */
export function BotonPerfil({ quien, abierto, alAbrir }: { quien: string; abierto: boolean; alAbrir: () => void }) {
  return (
    <button
      type="button"
      className="perfil__boton"
      aria-haspopup="dialog"
      aria-expanded={abierto}
      aria-label={`Tu perfil: ${quien}`}
      onClick={alAbrir}
    >
      <span className="perfil__avatar" aria-hidden="true">
        {iniciales(quien)}
      </span>
      <span className="perfil__nombre-corto">{quien}</span>
    </button>
  );
}

interface Props {
  abierta: boolean;
  alCerrar: () => void;
  quien: string;
  email: string | null;
  rol: Rol;
  usuarioId: string;
  alVencerSesion: (mensaje: string) => void;
  alSalir: () => void;
}

/**
 * Menú de perfil: quién sos, tu rol, los ajustes de la app (instalar y avisos) y Salir. Es una hoja que sube
 * desde abajo en el celular y cuelga del avatar en la compu.
 */
export function HojaPerfil({ abierta, alCerrar, quien, email, rol, usuarioId, alVencerSesion, alSalir }: Props) {
  const idTitulo = useId();
  return (
    <Hoja
      abierta={abierta}
      alCerrar={alCerrar}
      idTitulo={idTitulo}
      titulo="Tu perfil"
      variante="perfil"
      cabecera={
        <div className="perfil__persona">
          <span className="perfil__avatar perfil__avatar--grande" aria-hidden="true">
            {iniciales(quien)}
          </span>
          <div className="perfil__datos">
            <h2 id={idTitulo} className="perfil__nombre">
              {quien}
            </h2>
            <p className="perfil__rol">
              {ETIQUETA_ROL[rol]}
              {email && email !== quien && <span className="perfil__email"> · {email}</span>}
            </p>
          </div>
        </div>
      }
    >
      <ul role="list" className="perfil__filas">
        <li>
          <BotonTuRol rol={rol} alVencerSesion={alVencerSesion} />
        </li>
        <li>
          <BotonAjustes alVencerSesion={alVencerSesion} usuarioId={usuarioId} />
        </li>
      </ul>
      <button type="button" className="boton boton--secundario perfil__salir" onClick={alSalir}>
        <Icono nombre="salir" tamano={18} />
        Salir
      </button>
    </Hoja>
  );
}
