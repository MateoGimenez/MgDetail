import { afterEach, describe, expect, it } from 'vitest';
import type { SqlClient } from '../src/db/postgres.js';
import { formatResumen, normalizarTelefonos, runNormalizarTelefonos } from '../src/scripts/normalizar-telefonos-cli.js';
import { type PgliteDatabase, createPgliteDatabase } from './pglite.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function pglite(): Promise<PgliteDatabase> {
  const database = await createPgliteDatabase();
  cleanups.push(database.close);
  return database;
}

/** Turnos "viejos": como los dejaba el backend antes de la migración (telefono_whatsapp en null). */
async function turnoViejo(db: PgliteDatabase, nombre: string, telefono: string, telefonoWhatsapp: string | null = null) {
  await db.sql.query(
    `INSERT INTO mgdetailing.bookings (nombre, telefono, telefono_whatsapp, vehiculo_tipo, servicio_id, fecha_preferida, franja)
     VALUES ($1, $2, $3, 'auto', 'pulido', '2026-10-01', 'manana')`,
    [nombre, telefono, telefonoWhatsapp],
  );
}

async function telefonos(db: PgliteDatabase): Promise<Record<string, unknown>> {
  const { rows } = await db.sql.query('SELECT nombre, telefono_whatsapp FROM mgdetailing.bookings ORDER BY seq');
  return Object.fromEntries(rows.map((row) => [row.nombre, row.telefono_whatsapp]));
}

describe('npm run normalizar-telefonos', () => {
  it('completa los interpretables, deja en null los demás, no toca los ya completos y es idempotente', async () => {
    const db = await pglite();
    await turnoViejo(db, 'A', '0380 15-4123456');
    await turnoViejo(db, 'B', '+54 9 380 412-3456');
    await turnoViejo(db, 'C', '+1 415 555 2671');
    await turnoViejo(db, 'Raro', '1234-5678');
    await turnoViejo(db, 'Basura', 'no tengo');
    // Ya completo (con un valor distinto del que daría la regla): no se pisa.
    await turnoViejo(db, 'Listo', '3804123456', '5493800000000');

    const lines: string[] = [];
    // Como en producción: con el rol mgdetailing_app (alcanza con sus GRANT).
    expect(await runNormalizarTelefonos(db.appSql, (text) => lines.push(text))).toBe(0);
    expect(lines).toEqual(['3 turnos actualizados, 2 sin teléfono interpretable']);
    expect(await telefonos(db)).toEqual({
      A: '5493804123456',
      B: '5493804123456',
      C: '14155552671',
      Raro: null,
      Basura: null,
      Listo: '5493800000000',
    });

    // Segunda pasada: nada que hacer (los no interpretables se siguen informando).
    expect(await normalizarTelefonos(db.appSql)).toEqual({ actualizados: 0, sinTelefono: 2 });

    // Ningún teléfono ni nombre en la salida.
    const salida = lines.join('\n');
    for (const dato of ['4123456', '5493804123456', '415', '1234', 'Raro', 'Basura']) {
      expect(salida, dato).not.toContain(dato);
    }
  });

  it('sin turnos (o todos completos) informa 0 y 0', async () => {
    const db = await pglite();
    expect(await normalizarTelefonos(db.appSql)).toEqual({ actualizados: 0, sinTelefono: 0 });
  });

  it('después de normalizar, el historial y turnosDelCliente incluyen a los turnos viejos', async () => {
    const db = await pglite();
    await turnoViejo(db, 'Viejo', '0380 15-4123456');
    await turnoViejo(db, 'Otro viejo', '380 4123456');
    await normalizarTelefonos(db.appSql);
    const { rows } = await db.sql.query(
      "SELECT count(*)::int AS n FROM mgdetailing.bookings WHERE telefono_whatsapp = '5493804123456'",
    );
    expect(rows[0]?.n).toBe(2);
  });

  it('el resumen va en singular o plural', () => {
    expect(formatResumen({ actualizados: 1, sinTelefono: 1 })).toBe('1 turno actualizado, 1 sin teléfono interpretable');
    expect(formatResumen({ actualizados: 0, sinTelefono: 0 })).toBe('0 turnos actualizados, 0 sin teléfono interpretable');
  });

  it('si la base falla, sale con 1 y solo informa el mensaje (nunca el detalle con la fila)', async () => {
    const error = Object.assign(new Error('violates check constraint'), { detail: 'Failing row contains (Juan, 3804123456)' });
    const failing: SqlClient = {
      query: () => Promise.reject(error),
      transaction: (fn) => fn(failing),
    };
    const lines: string[] = [];
    expect(await runNormalizarTelefonos(failing, (text) => lines.push(text))).toBe(1);
    expect(lines).toEqual(['No se pudieron normalizar los teléfonos: violates check constraint']);
  });
});
