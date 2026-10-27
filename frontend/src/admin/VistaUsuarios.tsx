import { useEffect, useRef, useState } from 'react';
import type { UsuarioPanel } from '../api/contract-panel';
import { SubrayadoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { DialogoCuenta, DialogoEliminarUsuario, DialogoNuevoUsuario, type EdicionCuenta } from './DialogosUsuario';
import { EsqueletoUsuarios } from './Esqueleto';
import { FilaUsuario } from './FilaUsuario';
import { TablaPermisos } from './permisos/TablaPermisos';
import { usePermisos } from './permisos/usePermisos';
import { useUsuarios } from './useUsuarios';

interface Props {
  idPropio: string;
  alVencerSesion: (mensaje: string) => void;
}

type Pestana = 'cuentas' | 'permisos';

/** Gestión de usuarios (solo superadmin): alta, pendientes de activación arriba, después el resto. */
export function VistaUsuarios({ idPropio, alVencerSesion }: Props) {
  const u = useUsuarios(alVencerSesion);
  // La matriz de permisos sirve a la pestaña "Permisos por rol", al alta y al resumen de cada fila: se pide una vez.
  const permisos = usePermisos(alVencerSesion);
  const [pestana, setPestana] = useState<Pestana>('cuentas');
  const desactivarRef = useRef<HTMLDialogElement>(null);
  const nuevoRef = useRef<HTMLDialogElement>(null);
  const cuentaRef = useRef<HTMLDialogElement>(null);
  const eliminarRef = useRef<HTMLDialogElement>(null);
  const [aDesactivar, setADesactivar] = useState<UsuarioPanel | null>(null);
  const [aEliminar, setAEliminar] = useState<UsuarioPanel | null>(null);
  const [edicion, setEdicion] = useState<EdicionCuenta | null>(null);

  // El formulario de email o contraseña se arma con el usuario elegido: el diálogo se abre después de renderizarlo.
  useEffect(() => {
    if (edicion && !cuentaRef.current?.open) cuentaRef.current?.showModal();
  }, [edicion]);

  const pendientes = u.usuarios?.filter((x) => !x.activo) ?? [];
  const activos = u.usuarios?.filter((x) => x.activo) ?? [];

  const fila = (usuario: UsuarioPanel) => (
    <FilaUsuario
      key={`${usuario.id}|${usuario.updatedAt}`}
      usuario={usuario}
      esPropio={usuario.id === idPropio}
      ocupado={u.ocupados.has(usuario.id)}
      error={u.errores[usuario.id]}
      gestionCuentas={u.gestionCuentas}
      permisos={permisos.permisos}
      alCambiar={(cambios) => {
        void u.actualizar(usuario, cambios);
      }}
      alPedirDesactivar={() => {
        setADesactivar(usuario);
        desactivarRef.current?.showModal();
      }}
      alPedirEmail={() => {
        setEdicion({ modo: 'email', usuario });
      }}
      alPedirPassword={() => {
        setEdicion({ modo: 'password', usuario });
      }}
      alPedirEliminar={() => {
        setAEliminar(usuario);
        eliminarRef.current?.showModal();
      }}
    />
  );

  return (
    <section className="panel__vista" aria-labelledby="titulo-usuarios">
      <div className="panel__encabezado">
        <h1 id="titulo-usuarios" className="panel__titulo">
          Usuarios
        </h1>
        <div className="usuarios__botones">
          {pestana === 'cuentas' && u.gestionCuentas && (
            <button
              type="button"
              className="boton boton--primario boton--chico"
              onClick={() => {
                nuevoRef.current?.showModal();
              }}
            >
              <Icono nombre="mas" tamano={18} />
              Nuevo usuario
            </button>
          )}
          <button
            type="button"
            className="boton boton--secundario boton--chico"
            disabled={pestana === 'cuentas' ? u.cargando : permisos.cargando}
            onClick={pestana === 'cuentas' ? u.recargar : permisos.reintentar}
          >
            <Icono nombre="refrescar" tamano={18} />
            Actualizar
          </button>
        </div>
      </div>
      <nav className="filtros" aria-label="Secciones de usuarios">
        <ul role="list">
          {(
            [
              ['cuentas', 'Cuentas'],
              ['permisos', 'Permisos por rol'],
            ] as const
          ).map(([valor, texto]) => (
            <li key={valor}>
              <button
                type="button"
                className={valor === pestana ? 'filtro seleccionado' : 'filtro'}
                aria-pressed={valor === pestana}
                onClick={() => {
                  setPestana(valor);
                }}
              >
                {texto}
                {valor === pestana && <SubrayadoFilete className="filtro__trazo" />}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {pestana === 'permisos' && (
        <section aria-labelledby="titulo-permisos">
          <h2 id="titulo-permisos" className="usuarios__subtitulo">
            Qué puede hacer cada rol
          </h2>
          <p className="usuarios__ayuda-permisos">
            Los permisos los define el sistema según el rol: no se cambian uno por uno. Sí es que puede, No es que no, y
            Parcial es que puede una parte (se aclara cuál).
          </p>
          <div className="panel__estado" aria-live="polite">
            {permisos.cargando && <p>Cargando permisos…</p>}
          </div>
          {permisos.error && (
            <div className="panel__error" role="alert">
              <Icono nombre="alerta" tamano={22} />
              <div>
                <p>No pudimos cargar los permisos. {permisos.error}</p>
                <button type="button" className="boton boton--primario boton--chico" onClick={permisos.reintentar}>
                  Reintentar
                </button>
              </div>
            </div>
          )}
          {permisos.permisos && <TablaPermisos permisos={permisos.permisos} />}
        </section>
      )}

      {pestana === 'cuentas' && (
        <>
          <p className="usuarios__ayuda">
            Creá acá las cuentas de tu equipo y elegí qué puede hacer cada uno. Si alguien se olvida la contraseña,
            asignale una nueva con «Cambiar contraseña».
          </p>
          {u.usuarios && !u.gestionCuentas && (
            <p className="usuarios__aviso" role="status">
              <Icono nombre="alerta" tamano={18} />
              Para crear, eliminar o cambiar email/contraseña falta configurar SUPABASE_SECRET_KEY en el servidor.
            </p>
          )}

          <div className="panel__estado" aria-live="polite">
            {u.cargando && <p>Cargando usuarios…</p>}
          </div>

          {u.cargando && <EsqueletoUsuarios />}

          {u.error && (
            <div className="panel__error" role="alert">
              <Icono nombre="alerta" tamano={22} />
              <div>
                <p>No pudimos cargar los usuarios. {u.error}</p>
                <button type="button" className="boton boton--primario boton--chico" onClick={u.recargar}>
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {u.usuarios && u.usuarios.length === 0 && (
            <div className="panel__vacio">
              <p>Todavía no hay usuarios.</p>
            </div>
          )}

          {pendientes.length > 0 && (
            <section className="usuarios__grupo usuarios__grupo--pendientes" aria-labelledby="usuarios-pendientes">
              <h2 id="usuarios-pendientes" className="usuarios__subtitulo">
                Pendientes de activación <span className="filtro__cuenta">{pendientes.length}</span>
              </h2>
              <div className="turnos">{pendientes.map(fila)}</div>
            </section>
          )}

          {activos.length > 0 && (
            <section className="usuarios__grupo" aria-labelledby="usuarios-activos">
              <h2 id="usuarios-activos" className="usuarios__subtitulo">
                Con acceso al panel
              </h2>
              <div className="turnos">{activos.map(fila)}</div>
            </section>
          )}
        </>
      )}

      <DialogoNuevoUsuario dialogoRef={nuevoRef} alCrear={u.crear} permisos={permisos} />

      <DialogoCuenta
        dialogoRef={cuentaRef}
        edicion={edicion}
        esPropio={edicion?.usuario.id === idPropio}
        alGuardar={u.cambiarCuenta}
        alCerrar={() => {
          setEdicion(null);
        }}
      />

      <DialogoEliminarUsuario
        dialogoRef={eliminarRef}
        usuario={aEliminar}
        alConfirmar={u.eliminar}
        alCerrar={() => {
          setAEliminar(null);
        }}
      />

      <dialog
        ref={desactivarRef}
        className="confirmar"
        aria-labelledby="desactivar-titulo"
        aria-describedby="desactivar-texto"
        onClose={() => {
          setADesactivar(null);
        }}
      >
        <h2 id="desactivar-titulo" className="confirmar__titulo">
          ¿Desactivar a {aDesactivar?.nombre ?? aDesactivar?.email ?? 'este usuario'}?
        </h2>
        <p id="desactivar-texto" className="confirmar__texto">
          Pierde el acceso al panel en el próximo pedido que haga. Lo podés volver a activar cuando quieras.
        </p>
        <div className="confirmar__acciones">
          <button
            type="button"
            className="boton boton--secundario"
            onClick={() => {
              desactivarRef.current?.close();
            }}
          >
            No, volver
          </button>
          <button
            type="button"
            className="boton boton--peligro"
            onClick={() => {
              const usuario = aDesactivar;
              desactivarRef.current?.close();
              if (usuario) void u.actualizar(usuario, { activo: false });
            }}
          >
            Sí, desactivar
          </button>
        </div>
      </dialog>
    </section>
  );
}
