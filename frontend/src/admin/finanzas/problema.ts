import { ApiError } from '../../api/client';
import { esSesionPerdida } from '../../api/sesion';
import type { Problema } from '../useUsuarios';

/**
 * Traduce un error de un pedido de Finanzas a lo que muestra un formulario: el mensaje general y, si el backend los
 * mandó, los errores por campo (`fields`). Devuelve null si la sesión se perdió (el panel ya vuelve al ingreso).
 */
export function problemaDe(error: unknown, alVencerSesion: (mensaje: string) => void, porDefecto: string): Problema | null {
  if (esSesionPerdida(error)) {
    alVencerSesion(error.message);
    return null;
  }
  if (error instanceof ApiError) return { mensaje: error.message, campos: error.fields };
  return { mensaje: porDefecto };
}
