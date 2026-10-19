import type { Estado } from './booking.js';
import type { Rol } from './perfil.js';

/**
 * Permisos por rol. Es LA regla: la UI solo esconde botones, la API decide con estas funciones.
 *
 * | Rol        | Ver turnos | Cambiar estado            | Borrar turnos | Gestionar usuarios |
 * |------------|------------|---------------------------|---------------|--------------------|
 * | superadmin | sí         | a cualquier estado        | sí            | sí                 |
 * | admin      | sí         | a cualquier estado        | sí            | no                 |
 * | empleado   | sí         | solo a "completado"       | no            | no                 |
 */

export function puedeCambiarEstado(rol: Rol, estado: Estado): boolean {
  return rol === 'empleado' ? estado === 'completado' : true;
}

export function puedeBorrarTurnos(rol: Rol): boolean {
  return rol === 'superadmin' || rol === 'admin';
}

export function puedeGestionarUsuarios(rol: Rol): boolean {
  return rol === 'superadmin';
}
