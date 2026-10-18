const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Las columnas uuid de Postgres rechazan (con error) un texto que no tenga ese formato: se filtra antes. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
