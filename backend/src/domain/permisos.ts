import type { Booking, Estado } from './booking.js';
import type { Rol } from './perfil.js';

/**
 * Permisos por rol. Es LA regla: la UI solo esconde botones, la API decide con estas funciones.
 *
 * FUENTE ÚNICA: la lista CAPACIDADES de abajo. De ella salen las funciones `puede*` (las que usa la API para
 * decidir) y la tabla que ve el usuario (GET /api/admin/permisos). Un test verifica que las funciones coinciden con
 * la matriz para los tres roles.
 *
 * Resumen (detalle y matices en CAPACIDADES):
 *
 * | Capacidad                              | superadmin | admin | empleado                          |
 * |----------------------------------------|------------|-------|-----------------------------------|
 * | Ver turnos, agenda, clientes, notas    | sí         | sí    | sí                                |
 * | Cambiar el estado de un turno          | cualquiera | cualq.| solo a "completado"               |
 * | Reprogramar y borrar turnos            | sí         | sí    | no                                |
 * | Registrar el cobro y quién lo hizo     | sí         | sí    | parcial: queda como trabajador    |
 * | Corregir el cobro de un completado     | sí         | sí    | no                                |
 * | Catálogo (ver / editar)                | sí / sí    | sí / sí | sí / no                         |
 * | Disponibilidad (ver / editar)          | sí / sí    | sí / sí | sí / no                         |
 * | Estadísticas completas (con importes)  | sí         | sí    | no                                |
 * | Estadísticas propias (sin importes)    | sí         | sí    | sí                                |
 * | Gestionar usuarios                     | sí         | no    | no                                |
 * | Avisos push en su dispositivo          | sí         | sí    | sí                                |
 *
 * "Reprogramar" = cambiar la fecha/franja confirmadas de un turno (también al confirmarlo "para otra fecha", o
 * volver a la que pidió el cliente). "Editar catálogo" = crear servicios, editarlos y reordenarlos.
 * "Editar disponibilidad" = cambiar el horario semanal y crear, cambiar o quitar días especiales.
 * Notas internas (también en turnos cerrados), búsqueda e historial del cliente: todos los roles; el empleado es
 * quien está con el auto.
 */

/** "si" = puede; "no" = no puede; "parcial" = puede una parte (el matiz explica cuál). */
export type Nivel = 'si' | 'no' | 'parcial';

export interface Capacidad {
  /** Identificador estable ("turnos.estado"). */
  id: string;
  /** Para agrupar en la tabla ("Turnos"). */
  grupo: string;
  /** Qué se puede hacer, en español, empezando con un verbo en infinitivo. */
  texto: string;
  roles: Readonly<Record<Rol, Nivel>>;
  /** Solo para los roles con nivel "parcial": en qué consiste. */
  matiz?: Readonly<Partial<Record<Rol, string>>>;
}

/** La matriz de permisos: una fila por cosa que un rol puede o no hacer. El orden es el de la tabla. */
export const CAPACIDADES = [
  {
    id: 'turnos.ver',
    grupo: 'Turnos',
    texto: 'Ver los turnos y la agenda',
    roles: { superadmin: 'si', admin: 'si', empleado: 'si' },
  },
  {
    id: 'turnos.estado',
    grupo: 'Turnos',
    texto: 'Cambiar el estado de un turno',
    roles: { superadmin: 'si', admin: 'si', empleado: 'parcial' },
    matiz: { empleado: 'Solo puede marcarlos como Completado' },
  },
  {
    id: 'turnos.reprogramar',
    grupo: 'Turnos',
    texto: 'Cambiar la fecha y la franja de un turno',
    roles: { superadmin: 'si', admin: 'si', empleado: 'no' },
  },
  {
    id: 'turnos.borrar',
    grupo: 'Turnos',
    texto: 'Borrar turnos',
    roles: { superadmin: 'si', admin: 'si', empleado: 'no' },
  },
  {
    id: 'turnos.notas',
    grupo: 'Turnos',
    texto: 'Escribir notas internas en un turno',
    roles: { superadmin: 'si', admin: 'si', empleado: 'si' },
  },
  {
    id: 'turnos.clientes',
    grupo: 'Turnos',
    texto: 'Buscar turnos y ver el historial de un cliente',
    roles: { superadmin: 'si', admin: 'si', empleado: 'si' },
  },
  {
    id: 'cobro.registrar',
    grupo: 'Cobro',
    texto: 'Registrar cuánto se cobró por un trabajo y quién lo hizo',
    roles: { superadmin: 'si', admin: 'si', empleado: 'parcial' },
    matiz: { empleado: 'Al completar un turno queda como quien lo hizo, pero no carga el monto' },
  },
  {
    id: 'cobro.corregir',
    grupo: 'Cobro',
    texto: 'Corregir el monto y el trabajador de un turno ya completado',
    roles: { superadmin: 'si', admin: 'si', empleado: 'no' },
  },
  {
    id: 'catalogo.ver',
    grupo: 'Catálogo',
    texto: 'Ver los servicios del catálogo',
    roles: { superadmin: 'si', admin: 'si', empleado: 'si' },
  },
  {
    id: 'catalogo.editar',
    grupo: 'Catálogo',
    texto: 'Crear, editar y ordenar los servicios del catálogo',
    roles: { superadmin: 'si', admin: 'si', empleado: 'no' },
  },
  {
    id: 'disponibilidad.ver',
    grupo: 'Disponibilidad',
    texto: 'Ver el horario, los días especiales y los cupos',
    roles: { superadmin: 'si', admin: 'si', empleado: 'si' },
  },
  {
    id: 'disponibilidad.editar',
    grupo: 'Disponibilidad',
    texto: 'Cambiar el horario semanal y los días especiales',
    roles: { superadmin: 'si', admin: 'si', empleado: 'no' },
  },
  {
    id: 'estadisticas.completas',
    grupo: 'Estadísticas',
    texto: 'Ver las estadísticas del taller, con importes y de todo el equipo',
    roles: { superadmin: 'si', admin: 'si', empleado: 'no' },
  },
  {
    id: 'estadisticas.propias',
    grupo: 'Estadísticas',
    texto: 'Ver los trabajos que uno mismo completó, sin importes',
    roles: { superadmin: 'si', admin: 'si', empleado: 'si' },
  },
  {
    id: 'usuarios.gestionar',
    grupo: 'Usuarios',
    texto: 'Crear, editar y desactivar usuarios del panel',
    roles: { superadmin: 'si', admin: 'no', empleado: 'no' },
  },
  {
    id: 'push.activar',
    grupo: 'Avisos',
    texto: 'Activar los avisos de turnos nuevos en su propio dispositivo',
    roles: { superadmin: 'si', admin: 'si', empleado: 'si' },
  },
] as const satisfies readonly Capacidad[];

export type CapacidadId = (typeof CAPACIDADES)[number]['id'];

/** Nivel de un rol en una capacidad. */
export function nivelDe(rol: Rol, id: CapacidadId): Nivel {
  const capacidad = CAPACIDADES.find((candidata) => candidata.id === id);
  if (capacidad === undefined) throw new RangeError(`Capacidad desconocida: ${id}`);
  return capacidad.roles[rol];
}

export function puedeCambiarEstado(rol: Rol, estado: Estado): boolean {
  const nivel = nivelDe(rol, 'turnos.estado');
  return nivel === 'parcial' ? estado === 'completado' : nivel === 'si';
}

export function puedeReprogramar(rol: Rol): boolean {
  return nivelDe(rol, 'turnos.reprogramar') === 'si';
}

export function puedeBorrarTurnos(rol: Rol): boolean {
  return nivelDe(rol, 'turnos.borrar') === 'si';
}

export function puedeGestionarUsuarios(rol: Rol): boolean {
  return nivelDe(rol, 'usuarios.gestionar') === 'si';
}

export function puedeEditarCatalogo(rol: Rol): boolean {
  return nivelDe(rol, 'catalogo.editar') === 'si';
}

/**
 * "Editar disponibilidad" = cambiar el horario semanal y crear, cambiar o quitar días especiales. Verla (y ver los
 * cupos en la agenda): todos los roles.
 */
export function puedeEditarDisponibilidad(rol: Rol): boolean {
  return nivelDe(rol, 'disponibilidad.editar') === 'si';
}

/**
 * Ver las estadísticas completas (con importes y de todo el equipo) y, con ellas, los importes de cada turno
 * (`monto`). Las propias (GET /api/admin/estadisticas/mias) las puede ver cualquier rol.
 */
export function puedeVerEstadisticas(rol: Rol): boolean {
  return nivelDe(rol, 'estadisticas.completas') === 'si';
}

/**
 * Registrar el cobro de un trabajo completo: cargar el monto y elegir quién lo hizo. El empleado solo puede
 * completar un turno (queda como el trabajador, sin monto): para él esto es false.
 */
export function puedeRegistrarCobro(rol: Rol): boolean {
  return nivelDe(rol, 'cobro.registrar') === 'si';
}

/** Corregir el monto y el trabajador de un turno que ya estaba completado. */
export function puedeCorregirCobro(rol: Rol): boolean {
  return nivelDe(rol, 'cobro.corregir') === 'si';
}

/** Los importes (`monto`) los ven solo quienes ven las estadísticas completas: admin y superadmin. */
export function puedeVerImportes(rol: Rol): boolean {
  return puedeVerEstadisticas(rol);
}

/**
 * El turno tal como lo ve ese rol: el empleado nunca recibe el monto (siempre null, aunque el turno lo tenga). Se
 * aplica a TODA respuesta del panel que devuelva turnos (listado, agenda, PATCH).
 */
export function vistaDeTurno(rol: Rol, booking: Booking): Booking {
  return puedeVerImportes(rol) || booking.monto === null ? booking : { ...booking, monto: null };
}
