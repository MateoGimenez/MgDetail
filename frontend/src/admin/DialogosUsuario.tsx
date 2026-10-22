import { useEffect, useId, useRef, useState, type FormEvent, type RefObject, type SyntheticEvent } from 'react';
import {
  ETIQUETA_ROL,
  LIMITE_EMAIL_USUARIO,
  LIMITE_NOMBRE_USUARIO,
  PASSWORD_MAXIMO,
  PASSWORD_MINIMO,
  ROLES,
  esRol,
  type NuevoUsuario,
  type Rol,
  type UsuarioPanel,
} from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { CampoPassword } from './CampoPassword';
import type { Problema } from './useUsuarios';
import { errorEmail, errorNombre, errorPassword, normalizarEmail, soloErrores, type ErroresCampos } from './validacionUsuario';

const AYUDA_PASSWORD = `De ${String(PASSWORD_MINIMO)} a ${String(PASSWORD_MAXIMO)} caracteres. Pasásela a la persona por un medio privado.`;

const nombreDe = (usuario: UsuarioPanel | null) => usuario?.nombre ?? usuario?.email ?? 'este usuario';

/**
 * Mientras hay una petición en curso el diálogo no se cierra con Escape (y Cancelar está deshabilitado): si se
 * cerrara, la respuesta tardía cerraría o ensuciaría el diálogo siguiente, que puede ser de otro usuario.
 */
const bloquearEscape = (ocupado: boolean) => (evento: SyntheticEvent<HTMLDialogElement>) => {
  if (ocupado) evento.preventDefault();
};

/** false después de desmontarse: una respuesta que llega tarde no toca un formulario que ya no está. */
function useMontado() {
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  return montado;
}

/** Errores del servidor por campo (400 VALIDATION_ERROR), solo los que el formulario muestra. */
function erroresDelServidor(problema: Problema): ErroresCampos {
  const { email, password, nombre } = problema.campos ?? {};
  return soloErrores({ email, password, nombre });
}

function ErrorCampo({ id, mensaje }: { id: string; mensaje: string | undefined }) {
  if (!mensaje) return null;
  return (
    <p id={id} className="campo__error">
      <Icono nombre="alerta" tamano={18} />
      {mensaje}
    </p>
  );
}

function ErrorGeneral({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <p className="turno__error" role="alert">
      <Icono nombre="alerta" tamano={18} />
      {mensaje}
    </p>
  );
}

/* ---------- Alta ---------- */

interface PropsNuevo {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  /** null si se creó; si no, el problema para mostrar. */
  alCrear: (datos: NuevoUsuario) => Promise<Problema | null>;
}

/** Alta de un usuario del panel en un <dialog> modal. Al cerrarse, el formulario vuelve a empezar vacío. */
export function DialogoNuevoUsuario({ dialogoRef, alCrear }: PropsNuevo) {
  const [vuelta, setVuelta] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  return (
    <dialog
      ref={dialogoRef}
      className="confirmar dialogo-usuario"
      aria-labelledby="nuevo-usuario-titulo"
      onCancel={bloquearEscape(ocupado)}
      onClose={() => {
        setVuelta((n) => n + 1);
      }}
    >
      <FormularioNuevo
        key={vuelta}
        alCrear={alCrear}
        alCambiarOcupado={setOcupado}
        alTerminar={() => dialogoRef.current?.close()}
      />
    </dialog>
  );
}

function FormularioNuevo({
  alCrear,
  alCambiarOcupado,
  alTerminar,
}: {
  alCrear: PropsNuevo['alCrear'];
  alCambiarOcupado: (ocupado: boolean) => void;
  alTerminar: () => void;
}) {
  const id = useId();
  const montado = useMontado();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('empleado');
  const [activo, setActivo] = useState(true);
  const [errores, setErrores] = useState<ErroresCampos>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const locales = soloErrores({ email: errorEmail(email), password: errorPassword(password), nombre: errorNombre(nombre) });
    setErrores(locales);
    setError(null);
    if (Object.keys(locales).length > 0) return;

    setEnviando(true);
    alCambiarOcupado(true);
    const problema = await alCrear({
      email: normalizarEmail(email),
      password,
      nombre: nombre.trim() === '' ? null : nombre.trim(),
      rol,
      activo,
    });
    alCambiarOcupado(false);
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) {
      alTerminar();
      return;
    }
    setErrores(erroresDelServidor(problema));
    setError(problema.mensaje);
  };

  return (
    <form className="dialogo-usuario__form" noValidate onSubmit={(evento) => void enviar(evento)}>
      <h2 id="nuevo-usuario-titulo" className="confirmar__titulo">
        Nuevo usuario
      </h2>

      <div className="campo">
        <label className="campo__etiqueta" htmlFor={`${id}-email`}>
          Email
        </label>
        <input
          id={`${id}-email`}
          className="entrada"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={LIMITE_EMAIL_USUARIO}
          value={email}
          disabled={enviando}
          aria-invalid={errores.email ? true : undefined}
          aria-describedby={errores.email ? `${id}-email-error` : undefined}
          onChange={(evento) => {
            setEmail(evento.target.value);
          }}
        />
        <ErrorCampo id={`${id}-email-error`} mensaje={errores.email} />
      </div>

      <div className="campo">
        <label className="campo__etiqueta" htmlFor={`${id}-password`}>
          Contraseña
        </label>
        <CampoPassword
          id={`${id}-password`}
          valor={password}
          alCambiar={setPassword}
          deshabilitado={enviando}
          idAyuda={`${id}-password-ayuda`}
          idError={errores.password ? `${id}-password-error` : undefined}
        />
        <p id={`${id}-password-ayuda`} className="campo__ayuda">
          {AYUDA_PASSWORD}
        </p>
        <ErrorCampo id={`${id}-password-error`} mensaje={errores.password} />
      </div>

      <div className="campo">
        <label className="campo__etiqueta" htmlFor={`${id}-nombre`}>
          Nombre <span className="campo__opcional">(opcional)</span>
        </label>
        <input
          id={`${id}-nombre`}
          className="entrada"
          type="text"
          autoComplete="off"
          maxLength={LIMITE_NOMBRE_USUARIO}
          value={nombre}
          disabled={enviando}
          aria-invalid={errores.nombre ? true : undefined}
          aria-describedby={errores.nombre ? `${id}-nombre-error` : undefined}
          onChange={(evento) => {
            setNombre(evento.target.value);
          }}
        />
        <ErrorCampo id={`${id}-nombre-error`} mensaje={errores.nombre} />
      </div>

      <div className="campo">
        <label className="campo__etiqueta" htmlFor={`${id}-rol`}>
          Rol
        </label>
        <div className="desplegable">
          <select
            id={`${id}-rol`}
            className="entrada"
            value={rol}
            disabled={enviando}
            onChange={(evento) => {
              const valor = evento.target.value;
              if (esRol(valor)) setRol(valor);
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
          <Icono nombre="abajo" tamano={18} className="desplegable__icono" />
        </div>
      </div>

      <label className="casilla">
        <input
          type="checkbox"
          checked={activo}
          disabled={enviando}
          onChange={(evento) => {
            setActivo(evento.target.checked);
          }}
        />
        Puede entrar al panel desde ya
      </label>

      <ErrorGeneral mensaje={error} />

      <div className="confirmar__acciones">
        <button type="button" className="boton boton--secundario" onClick={alTerminar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" className="boton boton--primario" disabled={enviando}>
          <Icono nombre="mas" tamano={18} />
          {enviando ? 'Creando…' : 'Crear usuario'}
        </button>
      </div>
    </form>
  );
}

/* ---------- Email o contraseña ---------- */

export interface EdicionCuenta {
  modo: 'email' | 'password';
  usuario: UsuarioPanel;
}

interface PropsCuenta {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  edicion: EdicionCuenta | null;
  esPropio: boolean;
  alGuardar: (usuario: UsuarioPanel, cambios: { email?: string; password?: string }) => Promise<Problema | null>;
  alCerrar: () => void;
}

/** Cambiar el email o asignar una contraseña nueva (así se recupera el acceso: no hay emails de recuperación). */
export function DialogoCuenta({ dialogoRef, edicion, esPropio, alGuardar, alCerrar }: PropsCuenta) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <dialog
      ref={dialogoRef}
      className="confirmar dialogo-usuario"
      aria-labelledby="cuenta-titulo"
      onCancel={bloquearEscape(ocupado)}
      onClose={alCerrar}
    >
      {edicion && (
        <FormularioCuenta
          key={`${edicion.usuario.id}|${edicion.modo}`}
          edicion={edicion}
          esPropio={esPropio}
          alGuardar={alGuardar}
          alCambiarOcupado={setOcupado}
          alTerminar={() => dialogoRef.current?.close()}
        />
      )}
    </dialog>
  );
}

function FormularioCuenta({
  edicion: { modo, usuario },
  esPropio,
  alGuardar,
  alCambiarOcupado,
  alTerminar,
}: Omit<PropsCuenta, 'dialogoRef' | 'edicion' | 'alCerrar'> & {
  edicion: EdicionCuenta;
  alCambiarOcupado: (ocupado: boolean) => void;
  alTerminar: () => void;
}) {
  const id = useId();
  const montado = useMontado();
  const [valor, setValor] = useState(modo === 'email' ? (usuario.email ?? '') : '');
  const [errorCampo, setErrorCampo] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const esEmail = modo === 'email';

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    let local = esEmail ? errorEmail(valor) : errorPassword(valor);
    if (!local && esEmail && normalizarEmail(valor) === usuario.email) local = 'Es el mismo email que ya tiene.';
    setErrorCampo(local);
    setError(null);
    if (local) return;

    setEnviando(true);
    alCambiarOcupado(true);
    const problema = await alGuardar(usuario, esEmail ? { email: normalizarEmail(valor) } : { password: valor });
    alCambiarOcupado(false);
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) {
      alTerminar();
      return;
    }
    setErrorCampo(problema.campos?.[modo]);
    setError(problema.mensaje);
  };

  const quien = esPropio ? 'tu usuario' : nombreDe(usuario);
  const idError = errorCampo ? `${id}-error` : undefined;

  return (
    <form className="dialogo-usuario__form" noValidate onSubmit={(evento) => void enviar(evento)}>
      <h2 id="cuenta-titulo" className="confirmar__titulo">
        {esEmail ? `Cambiar el email de ${quien}` : `Nueva contraseña para ${quien}`}
      </h2>
      <p className="confirmar__texto">
        {esEmail
          ? 'Con este email va a ingresar al panel a partir de ahora.'
          : 'La contraseña anterior deja de funcionar. Así se recupera el acceso si alguien se la olvidó. Las sesiones ya abiertas siguen hasta que venzan: si sospechás que otra persona la usa, desactivá el usuario.'}
      </p>

      <div className="campo">
        <label className="campo__etiqueta" htmlFor={`${id}-valor`}>
          {esEmail ? 'Email nuevo' : 'Contraseña nueva'}
        </label>
        {esEmail ? (
          <input
            id={`${id}-valor`}
            className="entrada"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={LIMITE_EMAIL_USUARIO}
            value={valor}
            disabled={enviando}
            aria-invalid={idError ? true : undefined}
            aria-describedby={idError}
            onChange={(evento) => {
              setValor(evento.target.value);
            }}
          />
        ) : (
          <>
            <CampoPassword
              id={`${id}-valor`}
              valor={valor}
              alCambiar={setValor}
              deshabilitado={enviando}
              idAyuda={`${id}-ayuda`}
              idError={idError}
            />
            <p id={`${id}-ayuda`} className="campo__ayuda">
              {AYUDA_PASSWORD}
            </p>
          </>
        )}
        <ErrorCampo id={`${id}-error`} mensaje={errorCampo} />
      </div>

      <ErrorGeneral mensaje={error} />

      <div className="confirmar__acciones">
        <button type="button" className="boton boton--secundario" onClick={alTerminar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" className="boton boton--primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

/* ---------- Baja ---------- */

interface PropsEliminar {
  dialogoRef: RefObject<HTMLDialogElement | null>;
  usuario: UsuarioPanel | null;
  /** null si se eliminó (o ya no existía); si no, el mensaje de error. */
  alConfirmar: (usuario: UsuarioPanel) => Promise<string | null>;
  alCerrar: () => void;
}

/** Confirmación de baja definitiva en un <dialog> modal (mismo patrón que DialogoEliminar de turnos). */
export function DialogoEliminarUsuario({ dialogoRef, usuario, alConfirmar, alCerrar }: PropsEliminar) {
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    if (!usuario) return;
    setEliminando(true);
    setError(null);
    const problema = await alConfirmar(usuario);
    setEliminando(false);
    if (problema) setError(problema);
    else dialogoRef.current?.close();
  };
  // Ver bloquearEscape: mientras se elimina, el diálogo no se cierra (no puede quedar abierto otro usuario).

  return (
    <dialog
      ref={dialogoRef}
      className="confirmar"
      aria-labelledby="eliminar-usuario-titulo"
      aria-describedby="eliminar-usuario-texto"
      onCancel={bloquearEscape(eliminando)}
      onClose={() => {
        setError(null);
        alCerrar();
      }}
    >
      <h2 id="eliminar-usuario-titulo" className="confirmar__titulo">
        ¿Eliminar a {nombreDe(usuario)}?
      </h2>
      <p id="eliminar-usuario-texto" className="confirmar__texto">
        Se borra la cuenta{usuario?.email ? ` ${usuario.email}` : ''} y no se puede deshacer: no va a poder volver a
        ingresar. Si solo querés quitarle el acceso por un tiempo, mejor desactivalo.
      </p>
      <ErrorGeneral mensaje={error} />
      <div className="confirmar__acciones">
        <button
          type="button"
          className="boton boton--secundario"
          disabled={eliminando}
          onClick={() => {
            dialogoRef.current?.close();
          }}
        >
          No, volver
        </button>
        <button
          type="button"
          className="boton boton--peligro"
          disabled={eliminando}
          onClick={() => {
            void confirmar();
          }}
        >
          <Icono nombre="papelera" tamano={18} />
          {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
        </button>
      </div>
    </dialog>
  );
}
