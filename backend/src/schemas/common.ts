import type { z } from 'zod';
import { AppError } from '../lib/errors.js';

const MAX_FIELD_NAME_LENGTH = 64;

/**
 * Convierte los errores de zod al formato de la API: { nombreDelCampo: "mensaje" }.
 * Se queda con el primer mensaje de cada campo. Los campos desconocidos (.strict()) se informan por nombre.
 */
function toFieldErrors(error: z.ZodError): Record<string, string> {
  // Map + Object.fromEntries (y no `fields[name] = ...`): los nombres de campo los controla el cliente y
  // asignar a la clave "__proto__" de un objeto común dispararía el setter del prototipo en vez de crear la clave.
  const fields = new Map<string, string>();
  const setOnce = (name: string, message: string): void => {
    if (!fields.has(name)) fields.set(name, message);
  };

  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        // El nombre viene del cliente: se acota para no devolver textos enormes.
        const name = [...issue.path.map(String), key].join('.').slice(0, MAX_FIELD_NAME_LENGTH);
        setOnce(name, 'Este campo no está permitido.');
      }
      continue;
    }

    const name = issue.path.map(String).join('.');
    if (name !== '') {
      setOnce(name, issue.message);
    }
  }

  return Object.fromEntries(fields);
}

/** Valida `data` con el esquema o lanza AppError 400 VALIDATION_ERROR con `fields`. */
export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw AppError.validation(toFieldErrors(result.error));
  }
  return result.data;
}
