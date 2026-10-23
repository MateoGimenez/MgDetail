import type { SqlClient } from '../../db/postgres.js';
import { type Row, bool, isoTimestamp, oneOf, str, strOrNull } from '../../db/rows.js';
import {
  type CambiosPerfil,
  type Perfil,
  type PerfilRepository,
  ROLES,
  SESION_MAX_SEGUNDOS,
  SinSuperadminError,
} from '../../domain/perfil.js';
import { isUuid } from './uuid.js';

/** SQLSTATE propio del trigger mgdetailing_private.impedir_sin_superadmin (migración superadmin_trigger_definer). */
const SIN_SUPERADMIN_SQLSTATE = 'MG001';

function toPerfil(row: Row): Perfil {
  return {
    id: str(row, 'id'),
    email: strOrNull(row, 'email'),
    nombre: strOrNull(row, 'nombre'),
    rol: oneOf(ROLES, row, 'rol_id'),
    activo: bool(row, 'activo'),
    createdAt: isoTimestamp(row, 'created_at'),
    updatedAt: isoTimestamp(row, 'updated_at'),
  };
}

const hasSqlState = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;

/**
 * Perfiles del panel sobre Postgres (esquema mgdetailing). mgdetailing_app solo puede leerlos y actualizar
 * rol_id, activo, nombre y updated_at: los crea el trigger de auth.users y se borran en cascada con el usuario.
 */
export class PostgresPerfilRepository implements PerfilRepository {
  constructor(private readonly sql: SqlClient) {}

  async findForSession(
    userId: string,
    sessionId: string,
  ): Promise<{ perfil: Perfil; sesionVigente: boolean } | undefined> {
    if (!isUuid(userId) || !isUuid(sessionId)) return undefined;
    const { rows } = await this.sql.query(
      `SELECT p.id::text AS id, p.email, p.nombre, p.rol_id, p.activo, p.created_at, p.updated_at,
              mgdetailing_private.sesion_vigente($2::uuid, p.id, $3::integer) AS sesion_vigente
       FROM mgdetailing.perfiles AS p
       WHERE p.id = $1::uuid`,
      [userId, sessionId, SESION_MAX_SEGUNDOS],
    );
    const row = rows[0];
    return row ? { perfil: toPerfil(row), sesionVigente: bool(row, 'sesion_vigente') } : undefined;
  }

  async list(): Promise<Perfil[]> {
    const { rows } = await this.sql.query(
      `SELECT id::text AS id, email, nombre, rol_id, activo, created_at, updated_at
       FROM mgdetailing.perfiles
       ORDER BY created_at, id`,
    );
    return rows.map(toPerfil);
  }

  async findById(id: string): Promise<Perfil | undefined> {
    if (!isUuid(id)) return undefined;
    const { rows } = await this.sql.query(
      `SELECT id::text AS id, email, nombre, rol_id, activo, created_at, updated_at
       FROM mgdetailing.perfiles
       WHERE id = $1::uuid`,
      [id],
    );
    const row = rows[0];
    return row ? toPerfil(row) : undefined;
  }

  async update(id: string, cambios: CambiosPerfil, now: Date): Promise<Perfil | undefined> {
    if (!isUuid(id)) return undefined;
    try {
      const { rows } = await this.sql.query(
        `UPDATE mgdetailing.perfiles
         SET rol_id = coalesce($2::text, rol_id),
             activo = coalesce($3::boolean, activo),
             nombre = CASE WHEN $4::boolean THEN $5::text ELSE nombre END,
             updated_at = $6::timestamptz
         WHERE id = $1::uuid
         RETURNING id::text AS id, email, nombre, rol_id, activo, created_at, updated_at`,
        [
          id,
          cambios.rol ?? null,
          cambios.activo ?? null,
          cambios.nombre !== undefined,
          cambios.nombre ?? null,
          now.toISOString(),
        ],
      );
      const row = rows[0];
      return row ? toPerfil(row) : undefined;
    } catch (error) {
      if (hasSqlState(error, SIN_SUPERADMIN_SQLSTATE)) throw new SinSuperadminError();
      throw error;
    }
  }
}
