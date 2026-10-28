import type { SqlClient } from '../../db/postgres.js';
import { type Row, str, strOrNull } from '../../db/rows.js';
import type { Taller, TallerRepository } from '../../domain/taller.js';

function toTaller(row: Row): Taller {
  return {
    nombre: str(row, 'nombre'),
    telefono: strOrNull(row, 'telefono'),
    direccion: strOrNull(row, 'direccion'),
    instagram: strOrNull(row, 'instagram'),
    cuit: strOrNull(row, 'cuit'),
    leyendaPdf: strOrNull(row, 'leyenda_pdf'),
  };
}

/** Los datos del taller: una sola fila (id = 1) que la migración siembra y la app solo edita. */
export class PostgresTallerRepository implements TallerRepository {
  constructor(private readonly sql: SqlClient) {}

  async obtener(): Promise<Taller> {
    const { rows } = await this.sql.query(
      'SELECT nombre, telefono, direccion, instagram, cuit, leyenda_pdf FROM mgdetailing.taller WHERE id = 1',
    );
    const row = rows[0];
    if (!row) throw new Error('Falta la fila de mgdetailing.taller (aplicá la migración finanzas_gastos_metas_taller)');
    return toTaller(row);
  }

  async guardar(taller: Taller, ahora: Date): Promise<Taller> {
    const { rows } = await this.sql.query(
      `UPDATE mgdetailing.taller
       SET nombre = $1::text, telefono = $2::text, direccion = $3::text, instagram = $4::text, cuit = $5::text,
           leyenda_pdf = $6::text, updated_at = $7::timestamptz
       WHERE id = 1
       RETURNING nombre, telefono, direccion, instagram, cuit, leyenda_pdf`,
      [
        taller.nombre,
        taller.telefono,
        taller.direccion,
        taller.instagram,
        taller.cuit,
        taller.leyendaPdf,
        ahora.toISOString(),
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('Falta la fila de mgdetailing.taller (aplicá la migración finanzas_gastos_metas_taller)');
    return toTaller(row);
  }
}
