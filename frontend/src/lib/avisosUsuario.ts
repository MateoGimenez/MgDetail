import { ETIQUETA_ROL, type CambiosUsuario, type UsuarioPanel } from '../api/contract-panel';

/** Cómo se llama a la persona en un aviso: el nombre y, si no tiene, el email. */
export const quienEs = (usuario: Pick<UsuarioPanel, 'nombre' | 'email'>) => usuario.nombre ?? usuario.email ?? 'el usuario';

/** Lo que dice el aviso (toast) al guardar un cambio de un usuario. Manda el cambio más importante. */
export function avisoDeCambioUsuario(usuario: UsuarioPanel, cambios: CambiosUsuario): string {
  const quien = quienEs(usuario);
  if (cambios.password !== undefined) return `Cambiaste la contraseña de ${quien}.`;
  if (cambios.email !== undefined) return `Cambiaste el email de ${quien}.`;
  if (cambios.activo !== undefined) {
    return cambios.activo ? `${quien} ya tiene acceso al panel.` : `${quien} ya no tiene acceso al panel.`;
  }
  if (cambios.rol !== undefined) return `${quien} ahora es ${ETIQUETA_ROL[cambios.rol]}.`;
  return 'Cambios guardados.';
}
