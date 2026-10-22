import * as z from 'zod/mini';

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
