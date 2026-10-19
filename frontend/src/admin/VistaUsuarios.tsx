import { useRef, useState } from 'react';
import type { UsuarioPanel } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { FilaUsuario } from './FilaUsuario';
import { useUsuarios } from './useUsuarios';

interface Props {
  idPropio: string;
  alVencerSesion: (mensaje: string) => void;
}

/** Gestión de usuarios (solo superadmin): pendientes de activación arriba, después el resto. */
export function VistaUsuarios({ idPropio, alVencerSesion }: Props) {
  const u = useUsuarios(alVencerSesion);
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const [aDesactivar, setADesactivar] = useState<UsuarioPanel | null>(null);

  const pendientes = u.usuarios?.filter((x) => !x.activo) ?? [];
  const activos = u.usuarios?.filter((x) => x.activo) ?? [];

  const fila = (usuario: UsuarioPanel) => (
    <FilaUsuario
      key={`${usuario.id}|${usuario.updatedAt}`}
      usuario={usuario}
      esPropio={usuario.id === idPropio}
      ocupado={u.ocupados.has(usuario.id)}
      error={u.errores[usuario.id]}
      alCambiar={(cambios) => {
        void u.actualizar(usuario, cambios);
      }}
      alPedirDesactivar={() => {
        setADesactivar(usuario);
        dialogoRef.current?.showModal();
      }}
    />
  );

  return (
    <section className="panel__vista" aria-labelledby="titulo-usuarios">
      <div className="panel__encabezado">
        <h1 id="titulo-usuarios" className="panel__titulo">
          Usuarios
        </h1>
        <button type="button" className="boton boton--secundario boton--chico" disabled={u.cargando} onClick={u.recargar}>
          <Icono nombre="refrescar" tamano={18} />
          Actualizar
        </button>
      </div>
      <p className="usuarios__ayuda">
        Los usuarios se crean en Supabase (Authentication → Add user). Aparecen acá como empleado inactivo hasta que
        los actives.
      </p>

      <div className="panel__estado" aria-live="polite">
        {u.cargando && <p>Cargando usuarios…</p>}
      </div>

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
          <p>Todavía no hay usuarios. Crealos en Supabase y aparecen acá.</p>
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

      <dialog
        ref={dialogoRef}
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
              dialogoRef.current?.close();
            }}
          >
            No, volver
          </button>
          <button
            type="button"
            className="boton boton--peligro"
            onClick={() => {
              const usuario = aDesactivar;
              dialogoRef.current?.close();
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
