import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/connection.js';
import { LATEST_SCHEMA_VERSION, migrate } from '../src/db/migrations.js';

const directories: string[] = [];
const databases: DatabaseSync[] = [];

function memoryDb(): DatabaseSync {
  const db = openDatabase(':memory:');
  databases.push(db);
  return db;
}

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'mg-db-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const db of databases.splice(0)) if (db.isOpen) db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const userVersion = (db: DatabaseSync): unknown => db.prepare('PRAGMA user_version').get()?.user_version;
const tableNames = (db: DatabaseSync): string[] =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => String(row.name));

describe('migrate', () => {
  it('en una base nueva crea el esquema y deja user_version en la última versión', () => {
    const db = memoryDb();

    expect(userVersion(db)).toBe(0);
    expect(migrate(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(userVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(tableNames(db)).toEqual(['admins', 'bookings', 'sessions']);
  });

  it('es idempotente: correrla de nuevo no cambia nada ni borra datos', () => {
    const db = memoryDb();
    migrate(db);
    db.prepare('INSERT INTO admins (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run('a@b.co', 'h', 't', 't');

    expect(migrate(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(db.prepare('SELECT COUNT(*) AS n FROM admins').get()?.n).toBe(1);
  });

  it('se niega a operar sobre una base más nueva que el código', () => {
    const db = memoryDb();
    db.exec('PRAGMA user_version = 99');

    expect(() => migrate(db)).toThrow(/esquema v99.*más nuevo/);
  });

  it('si una migración falla se revierte entera (user_version y tablas intactos)', () => {
    const db = memoryDb();
    db.exec('CREATE TABLE admins (id INTEGER)'); // choca con la migración 1

    expect(() => migrate(db)).toThrow();
    expect(userVersion(db)).toBe(0);
    expect(tableNames(db)).toEqual(['admins']); // no quedaron bookings ni sessions a medias
  });
});

describe('restricciones del esquema (defensa en profundidad)', () => {
  const insertBooking = (db: DatabaseSync, overrides: Partial<Record<string, string>> = {}): void => {
    const row = {
      id: 'id-1',
      vehiculo_tipo: 'auto',
      servicio_id: 'pulido',
      fecha_preferida: '2026-10-20',
      franja: 'manana',
      estado: 'pendiente',
      ...overrides,
    };
    db.prepare(
      `INSERT INTO bookings (id, nombre, telefono, vehiculo_tipo, servicio_id, fecha_preferida, franja, estado, created_at, updated_at)
       VALUES (?, 'N', '12345678', ?, ?, ?, ?, ?, 't', 't')`,
    ).run(row.id, row.vehiculo_tipo, row.servicio_id, row.fecha_preferida, row.franja, row.estado);
  };

  it.each([
    ['estado', { estado: 'archivado' }],
    ['franja', { franja: 'noche' }],
    ['vehiculo_tipo', { vehiculo_tipo: 'bici' }],
    ['fecha_preferida', { fecha_preferida: '20/10/2026' }],
    ['servicio_id vacío', { servicio_id: '' }],
  ])('rechaza un %s inválido directamente en la base', (_label, overrides) => {
    const db = memoryDb();
    migrate(db);

    expect(() => {
      insertBooking(db, overrides);
    }).toThrow(/CHECK constraint failed/);
  });

  it('los emails de admins tienen que estar en minúsculas y ser únicos', () => {
    const db = memoryDb();
    migrate(db);
    const insert = db.prepare('INSERT INTO admins (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)');

    expect(() => insert.run('Dueno@Example.com', 'h', 't', 't')).toThrow(/CHECK constraint failed/);
    insert.run('dueno@example.com', 'h', 't', 't');
    expect(() => insert.run('dueno@example.com', 'h', 't', 't')).toThrow(/UNIQUE constraint failed/);
  });
});

describe('openDatabase', () => {
  it('crea la carpeta si no existe, activa WAL y los pragmas de seguridad', () => {
    const file = path.join(tempDir(), 'storage', 'anidada', 'mgdetailing.db');
    expect(existsSync(path.dirname(file))).toBe(false);

    const db = openDatabase(file);
    databases.push(db);

    expect(existsSync(file)).toBe(true);
    expect(db.prepare('PRAGMA journal_mode').get()?.journal_mode).toBe('wal');
    expect(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
    expect(db.prepare('PRAGMA secure_delete').get()?.secure_delete).toBe(1);
    expect(db.prepare('PRAGMA busy_timeout').get()?.timeout).toBe(5000);
    expect(db.prepare('PRAGMA trusted_schema').get()?.trusted_schema).toBe(0);
  });

  // Los permisos POSIX no aplican en Windows.
  it.skipIf(process.platform === 'win32')('la base y su archivo -wal quedan solo para el dueño (0600)', () => {
    const file = path.join(tempDir(), 'mgdetailing.db');
    const db = openDatabase(file);
    databases.push(db);
    migrate(db); // escribe: crea el -wal

    for (const target of [file, `${file}-wal`]) {
      expect(statSync(target).mode & 0o777, target).toBe(0o600);
    }
  });
});
