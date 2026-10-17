import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Abre la base SQLite (módulo nativo node:sqlite, sin dependencias que compilar).
 * `:memory:` se usa en los tests.
 */
export function openDatabase(dbPath: string): DatabaseSync {
  const inMemory = dbPath === ':memory:';

  if (!inMemory) {
    // 0o700/0o600 solo tienen efecto en POSIX; en Windows los permisos los hereda de la carpeta.
    mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  }

  const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });

  // Permisos ANTES de activar WAL: SQLite crea los archivos -wal y -shm (que también tienen datos personales)
  // copiando los permisos del .db. Si se restringieran después, esos archivos quedarían legibles por otros usuarios.
  if (!inMemory && process.platform !== 'win32') {
    chmodSync(dbPath, 0o600); // contiene datos personales y hashes de contraseña
  }

  // WAL: lecturas y escrituras concurrentes (el servidor y el script crear-admin pueden coincidir).
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  // Al borrar un turno se sobrescribe su contenido (datos personales) en vez de dejarlo en páginas libres.
  db.exec('PRAGMA secure_delete = ON');
  db.exec('PRAGMA trusted_schema = OFF');

  return db;
}
