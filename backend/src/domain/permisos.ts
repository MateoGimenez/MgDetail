import type { Estado } from './booking.js';
import type { Rol } from './perfil.js';

/**
 * Permisos por rol. Es LA regla: la UI solo esconde botones, la API decide con estas funciones.
 *
 * | Rol        | Ver turnos y agenda | Cambiar estado      | Reprogramar | Borrar turnos | Gestionar usuarios | Ver catálogo | Editar catálogo |
 * |------------|---------------------|---------------------|-------------|---------------|--------------------|--------------|-----------------|
 * | superadmin | sí                  | a cualquier estado  | sí          | sí            | sí                 | sí           | sí              |
 * | admin      | sí                  | a cualquier estado  | sí          | sí            | no                 | sí           | sí              |
 * | empleado   | sí                  | solo a "completado" | no          | no            | no                 | sí           | no              |
 *
 * "Reprogramar" = cambiar la fecha/franja confirmadas de un turno (también al confirmarlo "para otra fecha", o
 * volver a la que pidió el cliente).
 * "Editar catálogo" = crear servicios, editarlos (textos, precio, duración, destacado, activo) y reordenarlos.
 *
 * Notas internas (escribir y editar la nota de un turno, aunque esté cancelado o completado), búsqueda e historial
 * del cliente: todos los roles. El empleado es quien está con el auto. Por eso no hay función: no hay nada que negar.
 */

export function puedeCambiarEstado(rol: Rol, estado: Estado): boolean {
  return rol === 'empleado' ? estado === 'completado' : true;
}

export function puedeReprogramar(rol: Rol): boolean {
  return rol === 'superadmin' || rol === 'admin';
}

export function puedeBorrarTurnos(rol: Rol): boolean {
  return rol === 'superadmin' || rol === 'admin';
}

export function puedeGestionarUsuarios(rol: Rol): boolean {
  return rol === 'superadmin';
}

export function puedeEditarCatalogo(rol: Rol): boolean {
  return rol === 'superadmin' || rol === 'admin';
}
