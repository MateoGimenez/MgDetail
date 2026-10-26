import type { SqlClient } from '../../db/postgres.js';
import { int, str } from '../../db/rows.js';
import {
  type DestinoPush,
  MAX_DISPOSITIVOS_POR_USUARIO,
  type NuevaSuscripcion,
  type PushRepository,
} from '../../domain/push.js';
import { isUuid } from './uuid.js';

/** Clave 1 del advisory lock de las altas de dispositivos (7340001 a 7340003 ya están en uso). */
const LOCK_PUSH = 7340004;

/**
 * Suscripciones push sobre Postgres (esquema mgdetailing). mgdetailing_app puede leerlas, crearlas, borrarlas y
 * actualizar solo ultimo_aviso_at (migración push_suscripciones).
 */
export class PostgresPushRepository implements PushRepository {
  constructor(private readonly sql: SqlClient) {}

  async guardar(perfilId: string, suscripcion: NuevaSuscripcion): Promise<void> {
    await this.sql.transaction(async (tx) => {
      // Las altas de la misma persona se hacen de a una: el tope de dispositivos no se pasa con dos simultáneas.
      await tx.query('SELECT pg_advisory_xact_lock($1::int, hashtext($2::text))', [LOCK_PUSH, perfilId]);
      // Mismo aparato (endpoint) de otra persona o de la misma: se reemplaza la fila.
      await tx.query('DELETE FROM mgdetailing.push_suscripciones WHERE endpoint = $1', [suscripcion.endpoint]);
      await tx.query(
        `INSERT INTO mgdetailing.push_suscripciones (perfil_id, endpoint, p256dh, auth, agente)
         VALUES ($1::uuid, $2, $3, $4, $5)`,
        [perfilId, suscripcion.endpoint, suscripcion.p256dh, suscripcion.auth, suscripcion.agente],
      );
      // Se queda con los MAX más nuevos; el resto (los más viejos) se descarta.
      await tx.query(
        `DELETE FROM mgdetailing.push_suscripciones
         WHERE perfil_id = $1::uuid
           AND id NOT IN (
             SELECT id FROM mgdetailing.push_suscripciones
             WHERE perfil_id = $1::uuid
             ORDER BY created_at DESC, id DESC
             LIMIT $2::int
           )`,
        [perfilId, MAX_DISPOSITIVOS_POR_USUARIO],
      );
    });
  }

  async borrarPorEndpoint(endpoint: string): Promise<boolean> {
    const { rowCount } = await this.sql.query('DELETE FROM mgdetailing.push_suscripciones WHERE endpoint = $1', [
      endpoint,
    ]);
    return rowCount > 0;
  }

  async destinosActivos(): Promise<DestinoPush[]> {
    const { rows } = await this.sql.query(
      `SELECT s.id::text AS id, s.endpoint, s.p256dh, s.auth
       FROM mgdetailing.push_suscripciones AS s
       JOIN mgdetailing.perfiles AS p ON p.id = s.perfil_id
       WHERE p.activo
       ORDER BY s.created_at, s.id`,
    );
    return rows.map((row) => ({
      id: str(row, 'id'),
      endpoint: str(row, 'endpoint'),
      p256dh: str(row, 'p256dh'),
      auth: str(row, 'auth'),
    }));
  }

  async borrarPorIds(ids: readonly string[]): Promise<number> {
    const validos = ids.filter(isUuid);
    if (validos.length === 0) return 0;
    const { rowCount } = await this.sql.query('DELETE FROM mgdetailing.push_suscripciones WHERE id = ANY($1::uuid[])', [
      validos,
    ]);
    return rowCount;
  }

  async marcarAvisados(ids: readonly string[], now: Date): Promise<void> {
    const validos = ids.filter(isUuid);
    if (validos.length === 0) return;
    await this.sql.query('UPDATE mgdetailing.push_suscripciones SET ultimo_aviso_at = $2 WHERE id = ANY($1::uuid[])', [
      validos,
      now.toISOString(),
    ]);
  }

  async contarPendientes(): Promise<number> {
    const { rows } = await this.sql.query(
      "SELECT count(*)::int AS n FROM mgdetailing.bookings WHERE estado = 'pendiente'",
    );
    const row = rows[0];
    return row === undefined ? 0 : int(row, 'n');
  }
}
