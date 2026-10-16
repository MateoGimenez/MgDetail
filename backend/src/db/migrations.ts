import type { DatabaseSync } from 'node:sqlite';

/**
 * Migraciones simples versionadas con `PRAGMA user_version`.
 *
 * Reglas:
 * - Cada migración es una función con SQL estático (literal, sin interpolar nada) que termina con
 *   `PRAGMA user_version = <su versión>;`. El runner verifica que el número quedó bien; si no, revierte.
 * - Se agregan al final con la versión siguiente. Nunca se edita una migración ya publicada.
 * - Cada migración corre dentro de una transacción: o se aplica completa o no se aplica.
 */
interface Migration {
  version: number;
  description: string;
  up: (db: DatabaseSync) => void;
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'Esquema inicial: admins, sessions y bookings',
    up: (db) => {
      db.exec(`
        CREATE TABLE admins (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
          password_hash TEXT NOT NULL,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        ) STRICT;

        -- Sesiones activas (allowlist): permite cerrar sesión de verdad y revocar todas al cambiar la contraseña.
        CREATE TABLE sessions (
          id         TEXT PRIMARY KEY,
          admin_id   INTEGER NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL,
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX idx_sessions_admin ON sessions (admin_id);
        CREATE INDEX idx_sessions_expires ON sessions (expires_at);

        -- seq: orden interno y estable ("más nuevas primero"). id: UUID aleatorio, el único que sale por la API
        -- (los ids secuenciales filtrarían cuántos turnos hay, porque el POST público devuelve el id).
        CREATE TABLE bookings (
          seq             INTEGER PRIMARY KEY AUTOINCREMENT,
          id              TEXT NOT NULL UNIQUE,
          nombre          TEXT NOT NULL,
          telefono        TEXT NOT NULL,
          email           TEXT,
          vehiculo_tipo   TEXT NOT NULL CHECK (vehiculo_tipo IN ('auto', 'camioneta', 'moto')),
          vehiculo_modelo TEXT,
          servicio_id     TEXT NOT NULL CHECK (length(servicio_id) BETWEEN 1 AND 64),
          fecha_preferida TEXT NOT NULL CHECK (fecha_preferida GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
          franja          TEXT NOT NULL CHECK (franja IN ('manana', 'tarde')),
          comentario      TEXT,
          estado          TEXT NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente', 'confirmado', 'completado', 'cancelado')),
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        ) STRICT;
        CREATE INDEX idx_bookings_estado_seq ON bookings (estado, seq DESC);

        PRAGMA user_version = 1;
      `);
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce((max, migration) => Math.max(max, migration.version), 0);

function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get();
  const version = row?.user_version;
  if (typeof version !== 'number') {
    throw new TypeError('No se pudo leer PRAGMA user_version');
  }
  return version;
}

/**
 * Aplica las migraciones pendientes. Devuelve la versión final del esquema.
 * Si la base es más nueva que el código (versión desconocida) falla, para no operar sobre un esquema ajeno.
 */
export function migrate(db: DatabaseSync): number {
  const current = readUserVersion(db);
  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `La base de datos tiene el esquema v${String(current)}, más nuevo que el que conoce esta versión del backend (v${String(LATEST_SCHEMA_VERSION)}).`,
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      const after = readUserVersion(db);
      if (after !== migration.version) {
        throw new Error(
          `La migración v${String(migration.version)} (${migration.description}) dejó user_version en ${String(after)}; se revierte.`,
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return readUserVersion(db);
}
