import type { SqlClient } from '../db/postgres.js';
import { str } from '../db/rows.js';
import { telefonoWhatsapp } from '../domain/telefono.js';

/** Resultado de una pasada: cuántos turnos se completaron y cuántos quedaron sin teléfono interpretable. */
export interface ResumenNormalizacion {
  actualizados: number;
  sinTelefono: number;
}

/**
 * Completa mgdetailing.bookings.telefono_whatsapp en los turnos que lo tienen en null, con la misma regla que usa el
 * backend al crear un turno (domain/telefono.ts, libphonenumber: por eso no se puede hacer en SQL).
 *
 * Idempotente: solo toca filas con la columna en null (y lo vuelve a verificar en el UPDATE, por si otro proceso la
 * llenó en el medio); una segunda pasada actualiza 0. Los teléfonos que no se pueden interpretar quedan en null (y se
 * cuentan en `sinTelefono` en cada pasada). Todo en una transacción y en un solo UPDATE.
 *
 * Nota: el trigger set_updated_at pone updated_at = now() en las filas que se completan.
 */
export async function normalizarTelefonos(sql: SqlClient): Promise<ResumenNormalizacion> {
  return sql.transaction(async (tx) => {
    const { rows } = await tx.query(
      'SELECT id::text AS id, telefono FROM mgdetailing.bookings WHERE telefono_whatsapp IS NULL ORDER BY seq',
    );
    const ids: string[] = [];
    const numeros: string[] = [];
    let sinTelefono = 0;
    for (const row of rows) {
      const numero = telefonoWhatsapp(str(row, 'telefono'));
      if (numero === null) {
        sinTelefono += 1;
      } else {
        ids.push(str(row, 'id'));
        numeros.push(numero);
      }
    }
    if (ids.length === 0) return { actualizados: 0, sinTelefono };

    const { rowCount } = await tx.query(
      `UPDATE mgdetailing.bookings AS b
       SET telefono_whatsapp = v.numero
       FROM unnest($1::uuid[], $2::text[]) AS v(id, numero)
       WHERE b.id = v.id AND b.telefono_whatsapp IS NULL`,
      [ids, numeros],
    );
    return { actualizados: rowCount, sinTelefono };
  });
}

const turnos = (n: number): string => `${String(n)} ${n === 1 ? 'turno' : 'turnos'}`;

/** "N turnos actualizados, M sin teléfono interpretable". Solo cantidades: ningún teléfono ni dato personal. */
export function formatResumen({ actualizados, sinTelefono }: ResumenNormalizacion): string {
  return `${turnos(actualizados)} ${actualizados === 1 ? 'actualizado' : 'actualizados'}, ${String(sinTelefono)} sin teléfono interpretable`;
}

/**
 * Corre la normalización e informa el resumen por `out`. Si falla, informa solo el mensaje del error (nunca el
 * `detail` de Postgres, que puede traer la fila con datos del cliente). Devuelve el código de salida.
 */
export async function runNormalizarTelefonos(sql: SqlClient, out: (text: string) => void): Promise<number> {
  try {
    out(formatResumen(await normalizarTelefonos(sql)));
    return 0;
  } catch (error) {
    out(`No se pudieron normalizar los teléfonos: ${error instanceof Error ? error.message : 'error desconocido'}`);
    return 1;
  }
}
