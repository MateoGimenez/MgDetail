import { z } from 'zod';
import { ROLES } from '../domain/perfil.js';

const BIDI_CONTROLS = /\p{Bidi_Control}/gu;
const CONTROL_CHARS = /\p{Cc}/u;

/** Los ids de usuario son los UUID de auth.users. Cualquier otra cosa no puede existir => 404. */
export const usuarioIdSchema = z.uuid();

/**
 * PATCH /api/admin/usuarios/:id. Estricto (un campo desconocido => 400). Que venga al menos un campo lo verifica la ruta.
 * `nombre`: texto de una línea, 1 a 80 caracteres; null o "" lo borran.
 */
export const updateUsuarioSchema = z.strictObject({
    rol: z.enum(ROLES, { error: 'El rol tiene que ser superadmin, admin o empleado.' }).optional(),
    activo: z.boolean({ error: 'activo tiene que ser true o false.' }).optional(),
    nombre: z
      .union(
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
      )
      .optional(),
  });
