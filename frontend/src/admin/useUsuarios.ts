import { useEffect, useState } from 'react';
import { actualizarUsuario, crearUsuario, eliminarUsuario, listarUsuarios } from '../api/admin';
import { ApiError, esAbortado } from '../api/client';
import { esSesionPerdida } from '../api/sesion';
import type { CambiosUsuario, NuevoUsuario, UsuarioPanel } from '../api/contract-panel';

type Resultado =
  | { clave: number; usuarios: UsuarioPanel[]; gestionCuentas: boolean }
  | { clave: number; error: string };

/** Error de un formulario (crear, cambiar email o contraseña): mensaje general y, si vienen, errores por campo. */
export interface Problema {
  mensaje: string;
  campos?: Readonly<Record<string, string>>;
}

const conCambio = (conjunto: ReadonlySet<string>, id: string, activo: boolean) => {
  const nuevo = new Set(conjunto);
  if (activo) nuevo.add(id);
  else nuevo.delete(id);
  return nuevo;
};

/** Usuarios del panel (solo superadmin): lista, alta, cambios y baja. */
export function useUsuarios(alVencerSesion: (mensaje: string) => void) {
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(new Set());
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    const control = new AbortController();
    listarUsuarios(control.signal)
      .then(({ usuarios, gestionCuentas }) => {
        setResultado({ clave: recarga, usuarios, gestionCuentas });
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        if (esSesionPerdida(error)) {
          alVencerSesion(error.message);
          return;
        }
        setResultado({ clave: recarga, error: error instanceof Error ? error.message : 'No pudimos cargar los usuarios.' });
      });
    return () => {
      control.abort();
    };
  }, [recarga, alVencerSesion]);

  const cambiarLista = (cambio: (usuarios: UsuarioPanel[]) => UsuarioPanel[]) => {
    setResultado((previo) => (previo && 'usuarios' in previo ? { ...previo, usuarios: cambio(previo.usuarios) } : previo));
  };
  const reemplazar = (usuario: UsuarioPanel) => {
    cambiarLista((usuarios) => usuarios.map((u) => (u.id === usuario.id ? usuario : u)));
  };

  /** Traduce un error de un pedido: null si la sesión se perdió (el panel ya vuelve al ingreso). */
  const problemaDe = (error: unknown, porDefecto: string): Problema | null => {
    if (esSesionPerdida(error)) {
      alVencerSesion(error.message);
      return null;
    }
    if (error instanceof ApiError) return { mensaje: error.message, campos: error.fields };
    return { mensaje: porDefecto };
  };

  /** Cambio desde la fila (rol, activo, nombre). Devuelve true si se guardó. Los errores quedan en la fila. */
  const actualizar = async (usuario: UsuarioPanel, cambios: CambiosUsuario): Promise<boolean> => {
    setOcupados((o) => conCambio(o, usuario.id, true));
    setErrores((previos) => Object.fromEntries(Object.entries(previos).filter(([id]) => id !== usuario.id)));
    try {
      reemplazar(await actualizarUsuario(usuario.id, cambios));
      return true;
    } catch (error) {
      const problema = problemaDe(error, 'No se pudo guardar el cambio.');
      if (problema) setErrores((previos) => ({ ...previos, [usuario.id]: problema.mensaje }));
      return false;
    } finally {
      setOcupados((o) => conCambio(o, usuario.id, false));
    }
  };

  /** Si el error no fue de validación ni de regla (4xx), el cambio pudo quedar aplicado: se relee la lista. */
  const recargarSiFueDelServidor = (error: unknown) => {
    if (!(error instanceof ApiError && error.status < 500)) setRecarga((n) => n + 1);
  };

  /** Cambio desde un diálogo (email o contraseña). null = se guardó (o la sesión se perdió). */
  const cambiarCuenta = async (usuario: UsuarioPanel, cambios: Pick<CambiosUsuario, 'email' | 'password'>): Promise<Problema | null> => {
    setErrores((previos) => Object.fromEntries(Object.entries(previos).filter(([id]) => id !== usuario.id)));
    try {
      reemplazar(await actualizarUsuario(usuario.id, cambios));
      return null;
    } catch (error) {
      recargarSiFueDelServidor(error);
      return problemaDe(error, 'No se pudo guardar el cambio.');
    }
  };

  /** Alta de un usuario. null = se creó (o la sesión se perdió). */
  const crear = async (datos: NuevoUsuario): Promise<Problema | null> => {
    try {
      const creado = await crearUsuario(datos);
      cambiarLista((usuarios) => [...usuarios.filter((u) => u.id !== creado.id), creado]);
      return null;
    } catch (error) {
      recargarSiFueDelServidor(error);
      return problemaDe(error, 'No se pudo crear el usuario.');
    }
  };

  /** Baja definitiva. null = se eliminó o ya no existía; si no, el mensaje para mostrar en el diálogo. */
  const eliminar = async (usuario: UsuarioPanel): Promise<string | null> => {
    try {
      await eliminarUsuario(usuario.id);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        return problemaDe(error, 'No se pudo eliminar el usuario.')?.mensaje ?? null;
      }
    }
    cambiarLista((usuarios) => usuarios.filter((u) => u.id !== usuario.id));
    return null;
  };

  const vigente = resultado?.clave === recarga ? resultado : null;

  return {
    cargando: vigente === null,
    usuarios: vigente && 'usuarios' in vigente ? vigente.usuarios : null,
    gestionCuentas: vigente !== null && 'gestionCuentas' in vigente && vigente.gestionCuentas,
    error: vigente && 'error' in vigente ? vigente.error : null,
    ocupados,
    errores,
    actualizar,
    cambiarCuenta,
    crear,
    eliminar,
    recargar: () => {
      setRecarga((n) => n + 1);
    },
  };
}
