import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../lib/password.js';

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

/** Política para contraseñas NUEVAS (la usa el script crear-admin). */
export const newPasswordSchema = z
  .string({ error: 'Falta la contraseña.' })
  .min(PASSWORD_MIN_LENGTH, { error: `La contraseña tiene que tener al menos ${String(PASSWORD_MIN_LENGTH)} caracteres.` })
  .max(PASSWORD_MAX_LENGTH, { error: `La contraseña no puede tener más de ${String(PASSWORD_MAX_LENGTH)} caracteres.` });
