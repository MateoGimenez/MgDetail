import { normalizarTelefono } from './presupuestos';

/**
 * Datos del taller que salen en los PDF (GET/PUT /api/admin/taller): lectura y validación del formulario con las
 * reglas del contrato (reportes/2026-10-27_17_finanzas-inventario-documentos.md).
 */

export interface DatosTaller {
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  instagram: string | null;
  cuit: string | null;
  leyendaPdf: string | null;
}

export interface FormularioTaller {
  nombre: string;
  telefono: string;
  direccion: string;
  instagram: string;
  cuit: string;
  leyendaPdf: string;
}

export type ErroresTaller = Partial<Record<keyof FormularioTaller, string>>;

export const LIMITES_TALLER = { nombre: 80, direccion: 160, instagram: 30, leyendaPdf: 300 } as const;

export const formularioDeTaller = (t: DatosTaller): FormularioTaller => ({
  nombre: t.nombre,
  telefono: t.telefono ?? '',
  direccion: t.direccion ?? '',
  instagram: t.instagram ?? '',
  cuit: t.cuit ?? '',
  leyendaPdf: t.leyendaPdf ?? '',
});

const largo = (texto: string) => Array.from(texto).length;
const vacioANull = (texto: string): string | null => (texto === '' ? null : texto);

/** CUIT/CUIL: 11 dígitos, con o sin guiones (NN-NNNNNNNN-N). */
export const esCuitValido = (texto: string): boolean => /^\d{11}$/.test(texto) || /^\d{2}-\d{8}-\d$/.test(texto);

/** Instagram sin arroba; acepta que peguen "@mgdetailing" o el enlace del perfil. */
export function limpiarInstagram(texto: string): string {
  return texto
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/^@/, '');
}

export function validarTaller(
  f: FormularioTaller,
): { ok: true; datos: DatosTaller } | { ok: false; errores: ErroresTaller } {
  const errores: ErroresTaller = {};
  const nombre = f.nombre.trim();
  if (nombre === '') errores.nombre = 'El nombre es obligatorio: sale arriba de cada PDF.';
  else if (largo(nombre) > LIMITES_TALLER.nombre) errores.nombre = `Máximo ${String(LIMITES_TALLER.nombre)} caracteres.`;

  let telefono: string | null = null;
  if (f.telefono.trim() !== '') {
    telefono = normalizarTelefono(f.telefono);
    if (telefono === null) errores.telefono = 'No pudimos leer el teléfono. Escribilo con código de país, por ejemplo 54 9 380 478-1737.';
  }

  const direccion = f.direccion.trim();
  if (largo(direccion) > LIMITES_TALLER.direccion) errores.direccion = `Máximo ${String(LIMITES_TALLER.direccion)} caracteres.`;

  const instagram = limpiarInstagram(f.instagram);
  if (instagram !== '' && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) {
    errores.instagram = 'Solo el usuario, sin @: letras, números, puntos y guiones bajos (hasta 30).';
  }

  const cuit = f.cuit.trim();
  if (cuit !== '' && !esCuitValido(cuit)) errores.cuit = 'El CUIT tiene 11 dígitos: 20-12345678-9 o 20123456789.';

  const leyenda = f.leyendaPdf.trim();
  if (largo(leyenda) > LIMITES_TALLER.leyendaPdf) errores.leyendaPdf = `Máximo ${String(LIMITES_TALLER.leyendaPdf)} caracteres.`;

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return {
    ok: true,
    datos: {
      nombre,
      telefono,
      direccion: vacioANull(direccion),
      instagram: vacioANull(instagram),
      cuit: vacioANull(cuit),
      leyendaPdf: vacioANull(leyenda),
    },
  };
}

/** Los datos son iguales campo por campo: no hace falta guardar. */
export const mismosDatosDeTaller = (a: DatosTaller, b: DatosTaller): boolean =>
  a.nombre === b.nombre &&
  a.telefono === b.telefono &&
  a.direccion === b.direccion &&
  a.instagram === b.instagram &&
  a.cuit === b.cuit &&
  a.leyendaPdf === b.leyendaPdf;

/** Una línea con lo más importante, para el resumen plegado: "MgDetailing · 5493804781737". */
export function resumenDeTaller(t: DatosTaller): string {
  return [t.nombre, t.telefono, t.direccion].filter(Boolean).join(' · ');
}

/** Falta algo que conviene completar antes del primer PDF. */
export const faltaEnTaller = (t: DatosTaller): string[] =>
  [t.telefono ? null : 'el teléfono', t.direccion ? null : 'la dirección'].filter((x): x is string => x !== null);
