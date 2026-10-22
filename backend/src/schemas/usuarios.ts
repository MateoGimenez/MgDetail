import { z } from 'zod';
import { ROLES } from '../domain/perfil.js';
import { emailSchema } from './auth.js';

const BIDI_CONTROLS = /\p{Bidi_Control}/gu;
const CONTROL_CHARS = /\p{Cc}/u;

/** Los ids de usuario son los UUID de auth.users. Cualquier otra cosa no puede existir => 404. */
export const usuarioIdSchema = z.uuid();

/** Contraseña que elige el superadmin: 8 a 72 caracteres y no más de 72 bytes (el tope de bcrypt en Supabase Auth). */
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;
const passwordSchema = z
  .string({ error: 'Ingresá una contraseña.' })
  .min(PASSWORD_MIN, { error: `La contraseña tiene que tener al menos ${String(PASSWORD_MIN)} caracteres.` })
  .refine((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES, {
    error: `La contraseña no puede tener más de ${String(PASSWORD_MAX_BYTES)} caracteres.`,
  });

const rolSchema = z.enum(ROLES, { error: 'El rol tiene que ser superadmin, admin o empleado.' });

/** `nombre`: texto de una línea, 1 a 80 caracteres; null o "" lo borran. */
const nombreSchema = z.union(
  [
    z.null(),
    z
      .string()
      .transform((value) => value.replace(BIDI_CONTROLS, '').trim())
      .pipe(
        z
          .string()
          .max(80, { error: 'El nombre no puede tener más de 80 caracteres.' })
          .refine((value) => !CONTROL_CHARS.test(value), { error: 'El nombre tiene caracteres que no se permiten.' }),
      )
      .transform((value) => (value === '' ? null : value)),
  ],
  { error: 'El nombre tiene que ser un texto o null.' },
);

/** POST /api/admin/usuarios. Estricto (un campo desconocido => 400). */
export const createUsuarioSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  nombre: nombreSchema.optional().transform((value) => value ?? null),
  rol: rolSchema,
  activo: z.boolean({ error: 'activo tiene que ser true o false.' }),
});

/**
 * PATCH /api/admin/usuarios/:id. Estricto (un campo desconocido => 400). Que venga al menos un campo lo verifica la
 * ruta. email y password se cambian en Supabase Auth; el resto, en el perfil.
 */
export const updateUsuarioSchema = z.strictObject({
  rol: rolSchema.optional(),
  activo: z.boolean({ error: 'activo tiene que ser true o false.' }).optional(),
  nombre: nombreSchema.optional(),
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
});
