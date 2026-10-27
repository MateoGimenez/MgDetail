import { useId, useState } from 'react';
import {
  ETIQUETA_ROL,
  LIMITE_NOMBRE_USUARIO,
  ROLES,
  esRol,
  type CambiosUsuario,
  type Permisos,
  type UsuarioPanel,
} from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { momentoEnLaRioja } from '../lib/fechas';
import { nombreDeRol } from '../lib/permisosRol';
import { ResumenDeRol } from './permisos/ResumenDeRol';

interface Props {
  usuario: UsuarioPanel;
  esPropio: boolean;
  ocupado: boolean;
  error: string | undefined;
  /** El servidor puede cambiar email y contraseña y eliminar cuentas. */
  gestionCuentas: boolean;
  /** La matriz de permisos, para explicar qué puede hacer el rol de esta persona (null si todavía no cargó). */
  permisos: Permisos | null;
  alCambiar: (cambios: CambiosUsuario) => void;
  alPedirDesactivar: () => void;
  alPedirEmail: () => void;
  alPedirPassword: () => void;
  alPedirEliminar: () => void;
}

/** Un usuario del panel: nombre editable, rol, activar o desactivar, email, contraseña y baja. */
export function FilaUsuario({
  usuario,
  esPropio,
  ocupado,
  error,
  gestionCuentas,
  permisos,
  alCambiar,
  alPedirDesactivar,
  alPedirEmail,
  alPedirPassword,
  alPedirEliminar,
}: Props) {
  const id = useId();
  const [nombre, setNombre] = useState(usuario.nombre ?? '');
  const nombreCambiado = nombre.trim() !== (usuario.nombre ?? '');
  const titulo = usuario.nombre ?? usuario.email ?? 'Usuario sin email';

  return (
    <article
      className={usuario.activo ? 'turno usuario' : 'turno usuario usuario--inactivo'}
      aria-labelledby={`${id}-titulo`}
      aria-busy={ocupado}
    >
      <header className="turno__cabeza">
        <div className="turno__quien">
          <h3 id={`${id}-titulo`} className="turno__nombre">
            {titulo}
          </h3>
          {esPropio && <span className="turno__nueva">Vos</span>}
          {usuario.nombre && usuario.email && <span className="turno__ref">{usuario.email}</span>}
        </div>
        <span className={usuario.activo ? 'sello sello--confirmado' : 'sello sello--pendiente'}>
          {usuario.activo ? 'Activo' : 'Inactivo'}
        </span>
      </header>

      <div className="usuario__controles">
        <form
          className="usuario__nombre"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (nombreCambiado) alCambiar({ nombre: nombre.trim() === '' ? null : nombre.trim() });
          }}
        >
          <label className="campo__etiqueta" htmlFor={`${id}-nombre`}>
            Nombre
          </label>
          <div className="usuario__fila">
            <input
              id={`${id}-nombre`}
              className="entrada"
              type="text"
              autoComplete="off"
              maxLength={LIMITE_NOMBRE_USUARIO}
              placeholder="Sin nombre"
              value={nombre}
              disabled={ocupado}
              onChange={(evento) => {
                setNombre(evento.target.value);
              }}
            />
            <button type="submit" className="boton boton--secundario boton--chico" disabled={!nombreCambiado || ocupado}>
              Guardar
            </button>
          </div>
        </form>

        <div className="usuario__rol">
          <label className="campo__etiqueta" htmlFor={`${id}-rol`}>
            Rol
          </label>
          <div className="desplegable">
            <select
              id={`${id}-rol`}
              className="entrada"
              value={usuario.rol}
              disabled={esPropio || ocupado}
              aria-describedby={esPropio ? `${id}-propio` : undefined}
              onChange={(evento) => {
                const valor = evento.target.value;
                if (esRol(valor) && valor !== usuario.rol) alCambiar({ rol: valor });
              }}
            >
              {ROLES.map((rol) => (
                <option key={rol} value={rol}>
                  {ETIQUETA_ROL[rol]}
                </option>
              ))}
            </select>
            <Icono nombre="abajo" tamano={18} className="desplegable__icono" />
          </div>
        </div>
      </div>

      {permisos && (
        <details className="rol-detalle">
          <summary>Qué puede hacer {nombreDeRol(permisos, usuario.rol)}</summary>
          <ResumenDeRol permisos={permisos} rol={usuario.rol} persona="otra" nivel={4} />
        </details>
      )}

      {esPropio && (
        <p id={`${id}-propio`} className="usuario__nota">
          Es tu usuario: no podés cambiarte el rol, desactivarte ni eliminarte.
        </p>
      )}

      {error && (
        <p className="turno__error" role="alert">
          <Icono nombre="alerta" tamano={18} />
          {error}
        </p>
      )}

      <dl className="usuario__datos">
        <div>
          <dt>Alta</dt>
          <dd>{momentoEnLaRioja(usuario.createdAt)}</dd>
        </div>
      </dl>

      <div className="turno__acciones">
        {gestionCuentas && (
          <>
            <button type="button" className="boton boton--secundario boton--chico" disabled={ocupado} onClick={alPedirEmail}>
              <Icono nombre="mail" tamano={18} />
              Cambiar email
            </button>
            <button type="button" className="boton boton--secundario boton--chico" disabled={ocupado} onClick={alPedirPassword}>
              Cambiar contraseña
            </button>
          </>
        )}
        {usuario.activo ? (
          <button
            type="button"
            className="boton boton--fantasma boton--chico turno__eliminar"
            disabled={esPropio || ocupado}
            aria-describedby={esPropio ? `${id}-propio` : undefined}
            onClick={alPedirDesactivar}
          >
            Desactivar
          </button>
        ) : (
          <button
            type="button"
            className="boton boton--primario boton--chico"
            disabled={ocupado}
            onClick={() => {
              alCambiar({ activo: true });
            }}
          >
            <Icono nombre="check" tamano={18} />
            Activar
          </button>
        )}
        {gestionCuentas && !esPropio && (
          <button
            type="button"
            className="boton boton--fantasma boton--chico turno__eliminar usuario__eliminar"
            disabled={ocupado}
            onClick={alPedirEliminar}
          >
            <Icono nombre="papelera" tamano={18} />
            Eliminar
          </button>
        )}
      </div>
    </article>
  );
}
