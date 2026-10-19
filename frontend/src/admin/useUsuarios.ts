import { useEffect, useState } from 'react';
import { actualizarUsuario, listarUsuarios } from '../api/admin';
import { esAbortado } from '../api/client';
import { esSesionPerdida } from '../api/sesion';
import type { CambiosUsuario, UsuarioPanel } from '../api/contract-panel';

type Resultado = { clave: number; usuarios: UsuarioPanel[] } | { clave: number; error: string };

const conCambio = (conjunto: ReadonlySet<string>, id: string, activo: boolean) => {
  const nuevo = new Set(conjunto);
  if (activo) nuevo.add(id);
  else nuevo.delete(id);
  return nuevo;
};

/** Lista de usuarios del panel (solo superadmin) y sus cambios: rol, activo y nombre. */
export function useUsuarios(alVencerSesion: (mensaje: string) => void) {
  const [recarga, setRecarga] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(new Set());
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    const control = new AbortController();
    listarUsuarios(control.signal)
      .then((usuarios) => {
        setResultado({ clave: recarga, usuarios });
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

  /** Aplica un cambio. Devuelve true si se guardó. Los 409 quedan como mensaje en la fila. */
  const actualizar = async (usuario: UsuarioPanel, cambios: CambiosUsuario): Promise<boolean> => {
    setOcupados((o) => conCambio(o, usuario.id, true));
    setErrores((previos) => Object.fromEntries(Object.entries(previos).filter(([id]) => id !== usuario.id)));
    try {
      const actualizado = await actualizarUsuario(usuario.id, cambios);
      setResultado((previo) =>
        previo && 'usuarios' in previo
          ? { ...previo, usuarios: previo.usuarios.map((u) => (u.id === actualizado.id ? actualizado : u)) }
          : previo,
      );
      return true;
    } catch (error) {
      if (esSesionPerdida(error)) {
        alVencerSesion(error.message);
        return false;
      }
      const mensaje = error instanceof Error ? error.message : 'No se pudo guardar el cambio.';
      setErrores((previos) => ({ ...previos, [usuario.id]: mensaje }));
      return false;
    } finally {
      setOcupados((o) => conCambio(o, usuario.id, false));
    }
  };

  const vigente = resultado?.clave === recarga ? resultado : null;

  return {
    cargando: vigente === null,
    usuarios: vigente && 'usuarios' in vigente ? vigente.usuarios : null,
    error: vigente && 'error' in vigente ? vigente.error : null,
    ocupados,
    errores,
    actualizar,
    recargar: () => {
      setRecarga((n) => n + 1);
    },
  };
}
