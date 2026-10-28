import { fechaCorta } from './fechas';

/**
 * Comprobantes de pago (reportes/2026-10-27_17_finanzas-inventario-documentos.md). No son facturas: el PDF lo dice.
 */

export const FORMAS_DE_PAGO = ['efectivo', 'transferencia', 'debito', 'credito', 'otro'] as const;
export type FormaDePago = (typeof FORMAS_DE_PAGO)[number];

export const ETIQUETA_FORMA_DE_PAGO: Readonly<Record<FormaDePago, string>> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  otro: 'Otro',
};

export const esFormaDePago = (valor: string): valor is FormaDePago => (FORMAS_DE_PAGO as readonly string[]).includes(valor);

export const LIMITE_NOTA_COMPROBANTE = 200;

export const MENSAJE_SIN_FORMA = 'Elegí cómo pagó.';
export const MENSAJE_SIN_COBRO = 'Primero cargá el cobro del trabajo.';

/** Nombre del archivo PDF, igual al que manda el backend. */
export const nombreDeArchivoComprobante = (codigo: string): string => `Comprobante-${codigo}.pdf`;
export const nombreDeArchivoPresupuesto = (codigo: string): string => `Presupuesto-${codigo}.pdf`;

/** "R-0001 · Efectivo · 27 oct": la línea que identifica un comprobante ya emitido. */
export const lineaDeComprobante = (c: { codigo: string; formaPago: FormaDePago; fechaEmision: string }): string =>
  `${c.codigo} · ${ETIQUETA_FORMA_DE_PAGO[c.formaPago]} · ${fechaCorta(c.fechaEmision)}`;

/** Qué hacer con un turno completado: sin cobro no se emite nada. */
export type EstadoDeEmision = 'sin-cobro' | 'listo';
export const estadoDeEmision = (turno: { monto: number | null }): EstadoDeEmision => (turno.monto === null ? 'sin-cobro' : 'listo');
