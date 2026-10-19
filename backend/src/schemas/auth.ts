import { z } from 'zod';

/** Tope de largo de la contraseña que se acepta en el login (Supabase Auth admite hasta 72 bytes con bcrypt). */
export const PASSWORD_MAX_LENGTH = 128;

/** Email normalizado: sin espacios, en minúsculas, máx. 120 caracteres. */
export const emailSchema = z
  .string({ error: 'Ingresá tu email.' })
  .trim()
  .toLowerCase()
  .max(120, { error: 'El email no puede tener más de 120 caracteres.' })
  .pipe(z.email({ error: 'Revisá el email.' }));

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z
    .string({ error: 'Ingresá tu contraseña.' })
    .min(1, { error: 'Ingresá tu contraseña.' })
    .max(PASSWORD_MAX_LENGTH, { error: 'La contraseña es demasiado larga.' }),
});
