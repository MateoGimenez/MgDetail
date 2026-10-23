import type { Estado } from '../api/contract';
import type { Rol } from '../api/contract-panel';

/**
 * Qué muestra el panel según el rol. Espejo de backend/src/domain/permisos.ts:
 * la regla real la aplica el backend (403); acá solo se esconden botones.
 *
 * | Rol        | Cambiar estado      | Borrar turnos | Usuarios | Editar catálogo |
 * |------------|---------------------|---------------|----------|-----------------|
 * | superadmin | a cualquier estado  | sí            | sí       | sí              |
 * | admin      | a cualquier estado  | sí            | no       | sí              |
 * | empleado   | solo a "completado" | no            | no       | no (solo ver)   |
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

/** Crear, editar, activar, destacar y ordenar servicios. Ver el catálogo pueden todos los roles. */
export function puedeEditarCatalogo(rol: Rol): boolean {
  return rol === 'superadmin' || rol === 'admin';
}

/** El selector completo de estado solo tiene sentido si hay más de un destino posible. */
export function muestraSelectorDeEstado(rol: Rol): boolean {
  return rol !== 'empleado';
}

export interface Accion {
  a: Estado;
  texto: string;
  principal: boolean;
}

/** Acciones rápidas de cada estado (la que el dueño hace casi siempre va primero). */
const TRANSICIONES: Readonly<Record<Estado, readonly Accion[]>> = {
  pendiente: [
    { a: 'confirmado', texto: 'Confirmar', principal: true },
    { a: 'cancelado', texto: 'Cancelar', principal: false },
  ],
  confirmado: [
    { a: 'completado', texto: 'Marcar completado', principal: true },
    { a: 'cancelado', texto: 'Cancelar', principal: false },
  ],
  completado: [],
  cancelado: [{ a: 'pendiente', texto: 'Volver a pendiente', principal: false }],
};

/** Botones de transición que ve este rol para un turno en `estado`. */
export function accionesDeEstado(rol: Rol, estado: Estado): Accion[] {
  const permitidas = TRANSICIONES[estado].filter((accion) => puedeCambiarEstado(rol, accion.a));
  // El empleado solo completa: también puede hacerlo desde "pendiente".
  if (rol === 'empleado' && estado === 'pendiente') {
    return [{ a: 'completado', texto: 'Marcar completado', principal: true }];
  }
  return permitidas;
}
