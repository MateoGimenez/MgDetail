import * as z from 'zod/mini';
import { SLUG_SERVICIO_MAXIMO, camposServicioPublico } from './contract';

/**
 * Contrato del panel con Supabase Auth en modo BFF (usuario de la sesión, roles y
 * gestión de usuarios). Separado de contract.ts para que la landing no lo descargue.
 */

/* ---------- Usuarios del panel (Supabase Auth, roles) ---------- */

export const ROLES = ['superadmin', 'admin', 'empleado'] as const;
export type Rol = (typeof ROLES)[number];

export const ETIQUETA_ROL: Readonly<Record<Rol, string>> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  empleado: 'Empleado',
};

export const esRol = (valor: string): valor is Rol => (ROLES as readonly string[]).includes(valor);

/** Usuario de la sesión: login, me y refresh. */
export const usuarioSesionSchema = z.strictObject({
  id: z.string(),
  email: z.nullable(z.string()),
  nombre: z.nullable(z.string()),
  rol: z.enum(ROLES),
});
export type UsuarioSesion = z.output<typeof usuarioSesionSchema>;

export const respuestaSesionSchema = z.strictObject({ usuario: usuarioSesionSchema });

/** Usuario tal como lo ve el superadmin en la gestión de usuarios. */
export const usuarioPanelSchema = z.strictObject({
  id: z.string(),
  email: z.nullable(z.string()),
  nombre: z.nullable(z.string()),
  rol: z.enum(ROLES),
  activo: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UsuarioPanel = z.output<typeof usuarioPanelSchema>;

/**
 * gestionCuentas: false si el servidor no tiene la clave admin de Supabase (no puede crear ni borrar usuarios, ni
 * cambiarles el email o la contraseña). Rol, activo y nombre funcionan igual.
 */
export const listaDeUsuariosSchema = z.strictObject({ usuarios: z.array(usuarioPanelSchema), gestionCuentas: z.boolean() });
export const respuestaUsuarioSchema = z.strictObject({ usuario: usuarioPanelSchema });

/**
 * Cambios de PATCH /api/admin/usuarios/:id (al menos uno). nombre: hasta 80; "" o null lo borra.
 * email y password exigen gestionCuentas.
 */
export interface CambiosUsuario {
  rol?: Rol;
  activo?: boolean;
  nombre?: string | null;
  email?: string;
  password?: string;
}

/** Body de POST /api/admin/usuarios. */
export interface NuevoUsuario {
  email: string;
  password: string;
  nombre?: string | null;
  rol: Rol;
  activo: boolean;
}

export const LIMITE_NOMBRE_USUARIO = 80;
/** Mismo tope que el email del ingreso. */
export const LIMITE_EMAIL_USUARIO = 120;
export const PASSWORD_MINIMO = 8;
export const PASSWORD_MAXIMO = 72;

/* ---------- Catálogo de servicios (reportes/2026-10-22_07_catalogo-editable.md) ---------- */

/** Servicio tal como lo ve el panel: los campos públicos más activo, orden y updatedAt. */
export const servicioPanelSchema = z.strictObject({
  ...camposServicioPublico,
  activo: z.boolean(),
  orden: z.int(),
  updatedAt: z.string(),
});
export type ServicioPanel = z.output<typeof servicioPanelSchema>;

export const listaDeServiciosSchema = z.strictObject({ servicios: z.array(servicioPanelSchema) });
export const respuestaServicioSchema = z.strictObject({ servicio: servicioPanelSchema });

/** Límites del contrato (mismos que el backend). Los textos se miden después de recortar espacios. */
export const LIMITES_SERVICIO = {
  id: { max: SLUG_SERVICIO_MAXIMO },
  nombre: { max: 80 },
  resumen: { max: 200 },
  descripcion: { max: 1500 },
  incluye: { items: 15, max: 120 },
  glosario: { items: 10, termino: 60, significado: 300 },
  duracion: { max: 60 },
  precioDesde: { max: 99_999_999 },
} as const;

/** 409 de POST /api/admin/servicios cuando el id ya existe. */
export const CODIGO_SERVICIO_EXISTE = 'SERVICIO_EXISTE';

export interface TerminoGlosario {
  termino: string;
  significado: string;
}

/** Body de POST /api/admin/servicios. orden lo asigna el backend (al final). */
export interface NuevoServicio {
  id: string;
  nombre: string;
  resumen: string;
  descripcion: string;
  incluye: string[];
  glosario: TerminoGlosario[];
  duracion: string | null;
  precioDesde: number | null;
  destacado: boolean;
  activo: boolean;
}

/** Body de PATCH /api/admin/servicios/:id: al menos un campo; el id no se manda nunca. */
export type CambiosServicio = Partial<Omit<NuevoServicio, 'id'>>;

/* ---------- Disponibilidad (reportes/2026-10-23_11_disponibilidad-seguimiento-recordatorios.md) ---------- */

/** Cupos por franja: enteros de 0 a 20. Un cupo en 0 cierra esa franja. */
export const CUPO_MAXIMO = 20;
export const MOTIVO_MAXIMO = 80;

const cupoFranja = z.int().check(z.gte(0), z.lte(CUPO_MAXIMO));
/** Un cupo que puede faltar (día especial cerrado): se lee como null. */
const cupoOpcional = z.pipe(
  z.optional(z.nullable(cupoFranja)),
  z.transform((valor) => valor ?? null),
);

/**
 * Un día del horario semanal. `dia` sigue la convención de Date.getDay(): 0 = domingo, 1 = lunes … 6 = sábado.
 * Se lee con z.object (tolerante a campos de más): el contrato fija estos, el backend puede sumar otros.
 */
export const horarioDiaSchema = z.object({
  dia: z.int().check(z.gte(0), z.lte(6)),
  abierto: z.boolean(),
  cupoManana: cupoFranja,
  cupoTarde: cupoFranja,
});
export type HorarioDia = z.output<typeof horarioDiaSchema>;

/** Día especial: gana sobre el horario semanal. Cerrado (cupos null) o abierto con sus propios cupos. */
export const diaEspecialSchema = z.object({
  fecha: z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/)),
  abierto: z.boolean(),
  cupoManana: cupoOpcional,
  cupoTarde: cupoOpcional,
  motivo: z.pipe(
    z.optional(z.nullable(z.string())),
    z.transform((valor) => (valor === undefined || valor === null || valor.trim() === '' ? null : valor)),
  ),
});
export type DiaEspecial = z.output<typeof diaEspecialSchema>;

/** GET /api/admin/disponibilidad: los siete días del horario y los días especiales de hoy en adelante. */
export const disponibilidadPanelSchema = z.object({
  horarioSemanal: z.array(horarioDiaSchema).check(z.length(7)),
  diasEspeciales: z.array(diaEspecialSchema),
});

/** PUT /api/admin/disponibilidad/horario-semanal → el horario completo (como `horarioSemanal` o como `dias`). */
export const respuestaHorarioSchema = z.union([
  z.object({ horarioSemanal: z.array(horarioDiaSchema).check(z.length(7)) }),
  z.object({ dias: z.array(horarioDiaSchema).check(z.length(7)) }),
]);

/** PUT /api/admin/disponibilidad/dias-especiales/:fecha → `{ dia }`. */
export const respuestaDiaEspecialSchema = z.object({ dia: diaEspecialSchema });

/** Body de PUT /api/admin/disponibilidad/dias-especiales/:fecha: cerrado sin cupos, o abierto con los dos. */
export type CambioDiaEspecial =
  | { abierto: false; motivo: string | null }
  | { abierto: true; cupoManana: number; cupoTarde: number; motivo: string | null };

/* ---------- Cobro y permisos (reportes/2026-10-26_15_estadisticas-y-permisos.md) ---------- */

/** Persona activa a la que se le puede asignar un trabajo (GET /api/admin/trabajadores). */
export const trabajadorSchema = z.object({ id: z.string(), nombre: z.string(), rol: z.enum(ROLES) });
export type Trabajador = z.output<typeof trabajadorSchema>;
export const listaDeTrabajadoresSchema = z.object({ trabajadores: z.array(trabajadorSchema) });

/** Qué tanto puede un rol con una capacidad: sí, no, o solo una parte (el matiz lo explica). */
export const NIVELES_PERMISO = ['si', 'no', 'parcial'] as const;
export type NivelPermiso = (typeof NIVELES_PERMISO)[number];
const nivelPermiso = z.enum(NIVELES_PERMISO);

export const capacidadSchema = z.object({
  id: z.string(),
  grupo: z.string(),
  texto: z.string(),
  roles: z.object({ superadmin: nivelPermiso, admin: nivelPermiso, empleado: nivelPermiso }),
  matiz: z.optional(
    z.object({
      superadmin: z.optional(z.string()),
      admin: z.optional(z.string()),
      empleado: z.optional(z.string()),
    }),
  ),
});
export type Capacidad = z.output<typeof capacidadSchema>;

/** GET /api/admin/permisos: la matriz de capacidades por rol, única fuente de verdad (la arma el backend). */
export const permisosSchema = z.object({
  roles: z.array(z.object({ id: z.enum(ROLES), nombre: z.string(), descripcion: z.string() })),
  capacidades: z.array(capacidadSchema),
  tuRol: z.enum(ROLES),
});
export type Permisos = z.output<typeof permisosSchema>;
