import { LIMITE_EMAIL_USUARIO, LIMITE_NOMBRE_USUARIO, PASSWORD_MAXIMO, PASSWORD_MINIMO } from '../api/contract-panel';

/**
 * Validación de los formularios de usuarios del lado del navegador: avisa antes de mandar. La regla real la aplica
 * el backend (400 VALIDATION_ERROR con fields); estos mensajes son los mismos en espíritu.
 */

export type ErroresCampos = Partial<Record<'email' | 'password' | 'nombre', string>>;

const FORMA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** El email como lo manda el panel: sin espacios alrededor y en minúsculas. */
export const normalizarEmail = (email: string): string => email.trim().toLowerCase();

export function errorEmail(email: string): string | undefined {
  const limpio = normalizarEmail(email);
  if (limpio === '') return 'Ingresá el email.';
  if (limpio.length > LIMITE_EMAIL_USUARIO || !FORMA_EMAIL.test(limpio)) return 'Ingresá un email válido.';
  return undefined;
}

/** El tope es en bytes UTF-8 (bcrypt en Supabase Auth), como lo mide el backend: ñ, tildes y emoji ocupan más de uno. */
export function errorPassword(password: string): string | undefined {
  if (password.length < PASSWORD_MINIMO) return `La contraseña tiene que tener al menos ${String(PASSWORD_MINIMO)} caracteres.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAXIMO) {
    return `La contraseña es demasiado larga: hasta ${String(PASSWORD_MAXIMO)} caracteres (menos si usás acentos, ñ o símbolos).`;
  }
  return undefined;
}

export function errorNombre(nombre: string): string | undefined {
  return nombre.trim().length > LIMITE_NOMBRE_USUARIO
    ? `El nombre no puede tener más de ${String(LIMITE_NOMBRE_USUARIO)} caracteres.`
    : undefined;
}

/** Sin claves con undefined: un objeto vacío significa "todo bien". */
export function soloErrores(errores: ErroresCampos): ErroresCampos {
  return Object.fromEntries(Object.entries(errores).filter(([, mensaje]) => mensaje !== undefined));
}
