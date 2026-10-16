import type { DatabaseSync } from 'node:sqlite';

/**
 * Chequeo de salud de la base para /api/health: resuelve si la base responde y se rechaza si no.
 * Es un `() => Promise<void>` para que la ruta no dependa de SQLite (otra base implementaría lo mismo).
 */
export function createDatabaseCheck(db: DatabaseSync): () => Promise<void> {
  const ping = db.prepare('SELECT 1 AS ok');
  return () =>
    new Promise<void>((resolve, reject) => {
      try {
        ping.get();
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error('La base de datos no responde'));
      }
    });
}
