import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import PDFDocument from 'pdfkit';
import { BACKEND_ROOT } from '../config.js';
import type { Comprobante, FormaDePago } from '../domain/comprobantes.js';
import { type Presupuesto, importeDeItem } from '../domain/presupuestos.js';
import type { Taller } from '../domain/taller.js';
import { todayInLaRioja } from '../lib/dates.js';
import { formatearFecha, formatearNumero, formatearPesos } from '../lib/formato.js';

/**
 * PDF de presupuestos y comprobantes (contrato: reportes/2026-10-27_17_finanzas-inventario-documentos.md). Se arman
 * con pdfkit y fuentes estándar (Helvetica, WinAnsi: acentos y ñ salen bien) a partir de los datos guardados; nunca se
 * guarda el PDF. NO son facturas: las leyendas lo dicen.
 *
 * Seguridad: todo texto que viene de una persona pasa por `limpiar` (sin caracteres de control ni nada que la fuente no
 * pueda dibujar) y se dibuja como texto; no se crean enlaces, acciones ni scripts.
 */

export const LEYENDA_PRESUPUESTO = 'Presupuesto no vinculante hasta su aceptación. No es una factura.';
export const LEYENDA_COMPROBANTE = 'Comprobante de pago interno. No es una factura ni tiene validez fiscal.';

/** El logo vive en backend/assets: la ruta sale de la raíz del backend (vale desde src/ y desde dist/). */
export const RUTA_LOGO = path.join(BACKEND_ROOT, 'assets', 'logo.png');

export interface OpcionesPdf {
  /** false deja los textos legibles dentro del archivo (tests). Por omisión se comprime. */
  comprimir?: boolean;
}

const FORMAS_DE_PAGO: Readonly<Record<FormaDePago, string>> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Tarjeta de débito',
  credito: 'Tarjeta de crédito',
  otro: 'Otro',
};

/* Caracteres que la codificación WinAnsi (Windows-1252) de las fuentes estándar sí dibuja, fuera de U+0020 a U+00FF. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Texto seguro para dibujar: sin controles, sin lo que no entra en WinAnsi (se reemplaza por "?"). */
export function limpiar(texto: string): string {
  let salida = '';
  for (const caracter of texto.normalize('NFC')) {
    const codigo = caracter.codePointAt(0) ?? 0;
    if (/\p{Cf}/u.test(caracter)) {
      continue; // controles de formato (bidireccionales, ancho cero...): invisibles, no se dibujan
    } else if (caracter === '\n' || caracter === '\t') {
      salida += caracter === '\t' ? ' ' : caracter;
    } else if (codigo < 0x20 || (codigo >= 0x7f && codigo < 0xa0)) {
      continue;
    } else if (codigo <= 0xff || WIN_ANSI_EXTRA.has(caracter)) {
      salida += caracter;
    } else {
      salida += '?';
    }
  }
  return salida;
}

/** Nombre de archivo seguro para Content-Disposition: solo [A-Za-z0-9._-]. */
export function nombreDeArchivo(prefijo: 'Presupuesto' | 'Comprobante', codigo: string): string {
  return `${prefijo}-${codigo}`.replace(/[^A-Za-z0-9._-]/g, '_') + '.pdf';
}

let logoCache: Buffer | null | undefined;
function logo(): Buffer | null {
  if (logoCache === undefined) logoCache = existsSync(RUTA_LOGO) ? readFileSync(RUTA_LOGO) : null;
  return logoCache;
}

const A4_ALTO = 841.89;
const MARGEN = 50;
const ANCHO = 495;
const COLOR_TEXTO = '#1c1c1c';
const COLOR_SUAVE = '#666666';
const COLOR_LINEA = '#c9c9c9';
const COLOR_FONDO = '#f0f0f0';

function telefonoLegible(digitos: string): string {
  return parsePhoneNumberFromString(`+${digitos}`)?.formatInternational() ?? `+${digitos}`;
}

class Pagina {
  readonly doc: PDFKit.PDFDocument;
  private readonly partes: Buffer[] = [];
  readonly terminado: Promise<Buffer>;

  constructor(titulo: string, autor: string, opciones: OpcionesPdf) {
    this.doc = new PDFDocument({
      size: 'A4',
      margin: MARGEN,
      bufferPages: true,
      compress: opciones.comprimir ?? true,
      info: { Title: limpiar(titulo), Author: limpiar(autor), Creator: 'MgDetailing' },
    });
    this.terminado = new Promise<Buffer>((resolve, reject) => {
      this.doc.on('data', (parte: Buffer) => this.partes.push(parte));
      this.doc.on('end', () => {
        resolve(Buffer.concat(this.partes));
      });
      this.doc.on('error', reject);
    });
  }

  /** Hay lugar para `alto` puntos más; si no, pasa a la página siguiente. Devuelve la y donde seguir. */
  asegurar(y: number, alto: number): number {
    if (y + alto <= A4_ALTO - MARGEN) return y;
    this.doc.addPage();
    return MARGEN;
  }

  linea(y: number): void {
    this.doc.save().moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y).lineWidth(0.7).strokeColor(COLOR_LINEA).stroke().restore();
  }

  texto(contenido: string, x: number, y: number, ancho: number, opciones: { fuente?: string; tamanio?: number; color?: string; alinear?: 'left' | 'right' | 'center' } = {}): number {
    this.doc
      .font(opciones.fuente ?? 'Helvetica')
      .fontSize(opciones.tamanio ?? 10)
      .fillColor(opciones.color ?? COLOR_TEXTO)
      .text(limpiar(contenido), x, y, { width: ancho, align: opciones.alinear ?? 'left' });
    return this.doc.y;
  }

  alto(contenido: string, ancho: number, fuente = 'Helvetica', tamanio = 10): number {
    return this.doc.font(fuente).fontSize(tamanio).heightOfString(limpiar(contenido), { width: ancho });
  }

  /** "Página 2 de 3" al pie de cada hoja, solo si hay más de una. */
  pie(): void {
    const { start, count } = this.doc.bufferedPageRange();
    if (count <= 1) return;
    for (let i = 0; i < count; i += 1) {
      this.doc.switchToPage(start + i);
      // Sin margen inferior, para que dibujar en esa franja no abra otra página.
      this.doc.page.margins.bottom = 0;
      this.doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLOR_SUAVE)
        .text(`Página ${String(i + 1)} de ${String(count)}`, MARGEN, A4_ALTO - 30, { width: ANCHO, align: 'center', lineBreak: false });
    }
  }

  cerrar(): Promise<Buffer> {
    this.pie();
    this.doc.end();
    return this.terminado;
  }
}

/** Encabezado común: logo y datos del taller a la izquierda; título, código y fechas a la derecha. Devuelve la y siguiente. */
function encabezado(p: Pagina, taller: Taller, titulo: string, codigo: string, lineasDerecha: string[]): number {
  const imagen = logo();
  let yIzq = MARGEN;
  if (imagen) {
    p.doc.image(imagen, MARGEN, MARGEN, { fit: [150, 60] });
    yIzq = MARGEN + 68;
  }
  yIzq = p.texto(taller.nombre, MARGEN, yIzq, 260, { fuente: 'Helvetica-Bold', tamanio: 11 }) + 2;
  const datos = [
    taller.direccion,
    taller.telefono === null ? null : `Tel. ${telefonoLegible(taller.telefono)}`,
    taller.instagram === null ? null : `Instagram @${taller.instagram}`,
    taller.cuit === null ? null : `CUIT ${taller.cuit}`,
  ];
  for (const dato of datos) {
    if (dato !== null) yIzq = p.texto(dato, MARGEN, yIzq, 260, { tamanio: 9, color: COLOR_SUAVE }) + 1;
  }

  let yDer = p.texto(titulo, 330, MARGEN, 215, { fuente: 'Helvetica-Bold', tamanio: 17, alinear: 'right' }) + 2;
  yDer = p.texto(codigo, 330, yDer, 215, { fuente: 'Helvetica-Bold', tamanio: 13, alinear: 'right' }) + 4;
  for (const linea of lineasDerecha) {
    yDer = p.texto(linea, 330, yDer, 215, { tamanio: 9.5, color: COLOR_SUAVE, alinear: 'right' }) + 1;
  }
  const y = Math.max(yIzq, yDer) + 12;
  p.linea(y);
  return y + 14;
}

function bloque(p: Pagina, y: number, etiqueta: string, lineas: { texto: string; negrita?: boolean }[]): number {
  let alto = 14;
  for (const l of lineas) alto += p.alto(l.texto, ANCHO, l.negrita ? 'Helvetica-Bold' : 'Helvetica', 10.5) + 2;
  let actual = p.asegurar(y, alto);
  actual = p.texto(etiqueta.toUpperCase(), MARGEN, actual, ANCHO, { tamanio: 8, color: COLOR_SUAVE }) + 2;
  for (const l of lineas) {
    actual = p.texto(l.texto, MARGEN, actual, ANCHO, { fuente: l.negrita ? 'Helvetica-Bold' : 'Helvetica', tamanio: 10.5 }) + 2;
  }
  return actual + 8;
}

function leyendas(p: Pagina, y: number, leyenda: string, taller: Taller): number {
  const textos = [leyenda, ...(taller.leyendaPdf === null ? [] : [taller.leyendaPdf])];
  let alto = 8;
  for (const t of textos) alto += p.alto(t, ANCHO, 'Helvetica-Oblique', 9) + 3;
  let actual = p.asegurar(y + 6, alto);
  p.linea(actual);
  actual += 8;
  for (const t of textos) actual = p.texto(t, MARGEN, actual, ANCHO, { fuente: 'Helvetica-Oblique', tamanio: 9, color: COLOR_SUAVE }) + 3;
  return actual;
}

const COLUMNAS = {
  descripcion: { x: MARGEN + 6, ancho: 250 },
  cantidad: { x: MARGEN + 262, ancho: 48 },
  precio: { x: MARGEN + 316, ancho: 80 },
  importe: { x: MARGEN + 402, ancho: 87 },
} as const;

function encabezadoTabla(p: Pagina, y: number): number {
  p.doc.save().rect(MARGEN, y, ANCHO, 20).fill(COLOR_FONDO).restore();
  const opciones = { fuente: 'Helvetica-Bold', tamanio: 9 } as const;
  p.texto('Descripción', COLUMNAS.descripcion.x, y + 6, COLUMNAS.descripcion.ancho, opciones);
  p.texto('Cant.', COLUMNAS.cantidad.x, y + 6, COLUMNAS.cantidad.ancho, { ...opciones, alinear: 'right' });
  p.texto('Precio unit.', COLUMNAS.precio.x, y + 6, COLUMNAS.precio.ancho, { ...opciones, alinear: 'right' });
  p.texto('Importe', COLUMNAS.importe.x, y + 6, COLUMNAS.importe.ancho, { ...opciones, alinear: 'right' });
  return y + 26;
}

/** El PDF de un presupuesto. */
export async function generarPdfPresupuesto(presupuesto: Presupuesto, taller: Taller, opciones: OpcionesPdf = {}): Promise<Buffer> {
  const p = new Pagina(`Presupuesto ${presupuesto.codigo}`, taller.nombre, opciones);
  const fecha = formatearFecha(todayInLaRioja(new Date(presupuesto.createdAt)));
  let y = encabezado(p, taller, 'PRESUPUESTO', presupuesto.codigo, [
    `Fecha: ${fecha}`,
    `Válido hasta: ${formatearFecha(presupuesto.venceEl)} (${String(presupuesto.validezDias)} días)`,
  ]);

  const cliente = [{ texto: presupuesto.clienteNombre, negrita: true }];
  if (presupuesto.clienteTelefono !== null) cliente.push({ texto: `Tel. ${telefonoLegible(presupuesto.clienteTelefono)}`, negrita: false });
  y = bloque(p, y, 'Cliente', cliente);
  if (presupuesto.vehiculo !== null) y = bloque(p, y, 'Vehículo', [{ texto: presupuesto.vehiculo, negrita: false }]);

  y = p.asegurar(y, 60);
  y = encabezadoTabla(p, y);
  for (const item of presupuesto.items) {
    const alto = Math.max(p.alto(item.descripcion, COLUMNAS.descripcion.ancho), 12) + 8;
    if (y + alto > A4_ALTO - MARGEN) {
      p.doc.addPage();
      y = encabezadoTabla(p, MARGEN);
    }
    p.texto(item.descripcion, COLUMNAS.descripcion.x, y, COLUMNAS.descripcion.ancho);
    p.texto(formatearNumero(item.cantidad, 2), COLUMNAS.cantidad.x, y, COLUMNAS.cantidad.ancho, { alinear: 'right' });
    p.texto(formatearPesos(item.precioUnitario), COLUMNAS.precio.x, y, COLUMNAS.precio.ancho, { alinear: 'right' });
        p.texto(formatearPesos(importeDeItem(item)), COLUMNAS.importe.x, y, COLUMNAS.importe.ancho, { alinear: 'right' });
    y += alto;
    p.linea(y - 4);
  }

  y = p.asegurar(y + 6, presupuesto.descuento > 0 ? 80 : 56);
  const fila = (etiqueta: string, valor: string, grande = false): void => {
    const opcionesFila = { fuente: grande ? 'Helvetica-Bold' : 'Helvetica', tamanio: grande ? 13 : 10 } as const;
    p.texto(etiqueta, MARGEN + 250, y, 140, { ...opcionesFila, alinear: 'right' });
    p.texto(valor, MARGEN + 396, y, 99, { ...opcionesFila, alinear: 'right' });
    y += grande ? 24 : 16;
  };
  fila('Subtotal', formatearPesos(presupuesto.subtotal));
  if (presupuesto.descuento > 0) fila('Descuento', `- ${formatearPesos(presupuesto.descuento)}`);
  fila('TOTAL', formatearPesos(presupuesto.total), true);

  if (presupuesto.notas !== null) y = bloque(p, y + 6, 'Notas', [{ texto: presupuesto.notas, negrita: false }]);
  leyendas(p, y, LEYENDA_PRESUPUESTO, taller);
  return p.cerrar();
}

/** El PDF de un comprobante de pago. */
export async function generarPdfComprobante(comprobante: Comprobante, taller: Taller, opciones: OpcionesPdf = {}): Promise<Buffer> {
  const p = new Pagina(`Comprobante ${comprobante.codigo}`, taller.nombre, opciones);
  let y = encabezado(p, taller, 'COMPROBANTE DE PAGO', comprobante.codigo, [`Fecha: ${formatearFecha(comprobante.fechaEmision)}`]);

  y = bloque(p, y, 'Cliente', [{ texto: comprobante.clienteNombre, negrita: true }]);
  y = bloque(p, y, 'Servicio', [{ texto: comprobante.servicioNombre, negrita: false }]);
  if (comprobante.vehiculo !== null) y = bloque(p, y, 'Vehículo', [{ texto: comprobante.vehiculo, negrita: false }]);
  y = bloque(p, y, 'Forma de pago', [{ texto: FORMAS_DE_PAGO[comprobante.formaPago], negrita: false }]);

  y = p.asegurar(y, 50);
  p.doc.save().rect(MARGEN, y, ANCHO, 36).fill(COLOR_FONDO).restore();
  p.texto('MONTO', MARGEN + 10, y + 11, 120, { fuente: 'Helvetica-Bold', tamanio: 12 });
  p.texto(formatearPesos(comprobante.monto), MARGEN + 150, y + 9, ANCHO - 160, { fuente: 'Helvetica-Bold', tamanio: 16, alinear: 'right' });
  y += 50;

  if (comprobante.notas !== null) y = bloque(p, y, 'Notas', [{ texto: comprobante.notas, negrita: false }]);
  leyendas(p, y, LEYENDA_COMPROBANTE, taller);
  return p.cerrar();
}
