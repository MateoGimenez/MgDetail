import { MENSAJE_MONTO_TOPE, formatoPesos, leerMonto, type ResultadoMonto } from './cobro';
import { diaConMes, esFechaValida, sumarDias } from './fechas';
import { nombreDelMes } from './estadisticas';

/**
 * Finanzas del panel (reportes/2026-10-27_17_finanzas-inventario-documentos.md), en funciones puras: categorías,
 * meses (rango, navegación, etiquetas), agrupar gastos por día, validar el formulario de un gasto y de una meta, y
 * las frases del estado de la meta (ritmo, proyección, "te faltan…").
 */

/* ---------- Categorías ---------- */

export const CATEGORIAS = [
  'insumos',
  'herramientas',
  'alquiler',
  'servicios',
  'sueldos',
  'publicidad',
  'mantenimiento',
  'impuestos',
  'otros',
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ETIQUETA_CATEGORIA: Readonly<Record<Categoria, string>> = {
  insumos: 'Insumos',
  herramientas: 'Herramientas',
  alquiler: 'Alquiler',
  servicios: 'Servicios',
  sueldos: 'Sueldos',
  publicidad: 'Publicidad',
  mantenimiento: 'Mantenimiento',
  impuestos: 'Impuestos',
  otros: 'Otros',
};

/** Con la aclaración que ayuda a elegir ("Servicios (luz, agua, internet)"). */
export const ETIQUETA_CATEGORIA_LARGA: Readonly<Record<Categoria, string>> = {
  ...ETIQUETA_CATEGORIA,
  servicios: 'Servicios (luz, agua, internet)',
};

export const esCategoria = (valor: string): valor is Categoria => (CATEGORIAS as readonly string[]).includes(valor);

/** El nombre de una categoría; si el backend mandara una nueva, se muestra tal cual en vez de romper. */
export const nombreDeCategoria = (categoria: string): string => (esCategoria(categoria) ? ETIQUETA_CATEGORIA[categoria] : categoria);

/* ---------- Plata ---------- */

const MENOS = '−';

/** "$ 12.500" o "−$ 12.500" (con el signo menos de verdad: se lee mejor que el guion y no se confunde con un rango). */
export function pesosConSigno(n: number): string {
  const redondo = Math.round(n);
  return redondo < 0 ? `${MENOS}${formatoPesos(-redondo)}` : formatoPesos(redondo);
}

/** Margen (0..1 sobre los ingresos) como "34 %"; null si no hay ingresos para calcularlo. Puede ser negativo. */
export function textoMargen(margen: number | null): string {
  if (margen === null) return '—';
  const pct = Math.round(margen * 1000) / 10;
  const texto = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(Math.abs(pct));
  return `${pct < 0 ? MENOS : ''}${texto} %`;
}

/* ---------- Meses ("YYYY-MM") ---------- */

const MES = /^(\d{4})-(\d{2})$/;

export const esMes = (texto: string): boolean => {
  const partes = MES.exec(texto);
  return partes !== null && Number(partes[2]) >= 1 && Number(partes[2]) <= 12;
};

export const mesDeFecha = (fecha: string): string => fecha.slice(0, 7);

/** Suma (o resta) meses a un "YYYY-MM". */
export function sumarMeses(mes: string, cantidad: number): string {
  const partes = MES.exec(mes);
  if (!partes) throw new RangeError('Mes inválido');
  const total = Number(partes[1]) * 12 + (Number(partes[2]) - 1) + cantidad;
  const anio = Math.floor(total / 12);
  return `${String(anio)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Diferencia en meses: positiva si `b` es posterior a `a`. */
export function mesesEntre(a: string, b: string): number {
  const pa = MES.exec(a);
  const pb = MES.exec(b);
  if (!pa || !pb) throw new RangeError('Mes inválido');
  return Number(pb[1]) * 12 + Number(pb[2]) - (Number(pa[1]) * 12 + Number(pa[2]));
}

/** Último día de un mes: "2026-02" → "2026-02-28". */
export function ultimoDia(mes: string): string {
  return sumarDias(`${sumarMeses(mes, 1)}-01`, -1);
}

/**
 * Rango de fechas de un mes. Si es el mes de `hoy`, termina hoy (no se pide el futuro); un mes futuro queda con el
 * rango entero, que el backend contesta en cero.
 */
export function rangoDelMes(mes: string, hoy: string): { desde: string; hasta: string } {
  const desde = `${mes}-01`;
  const fin = ultimoDia(mes);
  return { desde, hasta: mesDeFecha(hoy) === mes ? hoy : fin };
}

/** "octubre de 2026". */
export function etiquetaDelMes(mes: string): string {
  const partes = MES.exec(mes);
  if (!partes) return mes;
  return `${nombreDelMes(Number(partes[2]))} de ${String(partes[1])}`;
}

/** "octubre" (sin el año), para las filas del historial. */
export function nombreCortoDeMes(mes: string): string {
  const partes = MES.exec(mes);
  return partes ? nombreDelMes(Number(partes[2])) : mes;
}

/** Meses a los que se puede fijar una meta: de 12 atrás a 12 adelante de hoy (contrato). */
export const MESES_ATRAS_META = 12;
export const MESES_ADELANTE_META = 12;

export function mesPermitidoParaMeta(mes: string, hoy: string): boolean {
  if (!esMes(mes)) return false;
  const distancia = mesesEntre(mesDeFecha(hoy), mes);
  return distancia >= -MESES_ATRAS_META && distancia <= MESES_ADELANTE_META;
}

/** El mes actual y los 11 siguientes, para elegir de qué mes es la meta que se fija. */
export function mesesParaFijarMeta(hoy: string): string[] {
  const actual = mesDeFecha(hoy);
  return Array.from({ length: 12 }, (_, i) => sumarMeses(actual, i));
}

/* ---------- Gastos ---------- */

export interface GastoBasico {
  id: string;
  fecha: string;
}

export interface GrupoDeGastos<T extends GastoBasico> {
  fecha: string;
  /** "miércoles 21 de octubre". */
  titulo: string;
  gastos: T[];
}

/**
 * Junta los gastos por día manteniendo el orden en que vienen (el backend los manda por fecha descendente). Si una
 * misma fecha aparece separada (páginas distintas), igual queda en un solo grupo.
 */
export function agruparGastosPorDia<T extends GastoBasico>(gastos: readonly T[]): GrupoDeGastos<T>[] {
  const grupos = new Map<string, GrupoDeGastos<T>>();
  for (const gasto of gastos) {
    const existente = grupos.get(gasto.fecha);
    if (existente) existente.gastos.push(gasto);
    else grupos.set(gasto.fecha, { fecha: gasto.fecha, titulo: diaConMes(gasto.fecha), gastos: [gasto] });
  }
  return [...grupos.values()];
}

/**
 * Como `leerMonto` ("25000", "25.000", "$ 25.000"), pero con el tope que se pase: el del cobro de un trabajo es más
 * chico que el de una meta mensual.
 */
export function leerPesos(texto: string, tope: number): ResultadoMonto {
  const leido = leerMonto(texto);
  const demasiado = { error: `Es demasiado: el máximo es ${formatoPesos(tope)}.` };
  if ('valor' in leido) return leido.valor !== null && leido.valor > tope ? demasiado : leido;
  if (leido.error !== MENSAJE_MONTO_TOPE) return leido;
  // Pasó el tope del cobro, pero el texto estaba bien escrito: se vuelve a leer contra el tope pedido.
  const n = Number(texto.replace(/^s*$s*/, '').replace(/[.s]/g, ''));
  return Number.isSafeInteger(n) && n <= tope ? { valor: n } : demasiado;
}

export const LIMITES_GASTO = {
  descripcion: 120,
  proveedor: 80,
  monto: { min: 1, max: 99_999_999 },
} as const;

export interface FormularioGasto {
  fecha: string;
  categoria: string;
  descripcion: string;
  monto: string;
  proveedor: string;
}

export interface DatosGasto {
  fecha: string;
  categoria: Categoria;
  descripcion: string;
  monto: number;
  proveedor: string | null;
}

export type ErroresGasto = Partial<Record<'fecha' | 'categoria' | 'descripcion' | 'monto' | 'proveedor', string>>;

export type ValidacionGasto = { ok: true; datos: DatosGasto } | { ok: false; errores: ErroresGasto };

/** Controla el formulario con las mismas reglas que el backend (la fecha de "hoy" viene de afuera). */
export function validarGasto(f: FormularioGasto, hoy: string): ValidacionGasto {
  const errores: ErroresGasto = {};

  if (!esFechaValida(f.fecha)) errores.fecha = 'Elegí la fecha del gasto.';
  else if (f.fecha > hoy) errores.fecha = 'La fecha no puede ser futura: cargá el gasto cuando lo hagas.';

  if (!esCategoria(f.categoria)) errores.categoria = 'Elegí una categoría.';

  const descripcion = f.descripcion.trim();
  if (descripcion === '') errores.descripcion = 'Contá en qué se gastó, por ejemplo “Shampoo para autos”.';
  else if (descripcion.length > LIMITES_GASTO.descripcion) {
    errores.descripcion = `Usá hasta ${String(LIMITES_GASTO.descripcion)} caracteres (tiene ${String(descripcion.length)}).`;
  }

  const proveedor = f.proveedor.trim();
  if (proveedor.length > LIMITES_GASTO.proveedor) {
    errores.proveedor = `Usá hasta ${String(LIMITES_GASTO.proveedor)} caracteres (tiene ${String(proveedor.length)}).`;
  }

  const monto = leerPesos(f.monto, LIMITES_GASTO.monto.max);
  let valor = 0;
  if ('error' in monto) errores.monto = monto.error;
  else if (monto.valor === null) errores.monto = 'Cargá cuánto gastaste, en pesos.';
  else if (monto.valor < LIMITES_GASTO.monto.min) errores.monto = 'El monto tiene que ser de al menos $ 1.';
  else if (monto.valor > LIMITES_GASTO.monto.max) {
    errores.monto = `Es demasiado: el máximo es ${formatoPesos(LIMITES_GASTO.monto.max)}.`;
  } else valor = monto.valor;

  if (Object.keys(errores).length > 0 || !esCategoria(f.categoria)) return { ok: false, errores };
  return {
    ok: true,
    datos: { fecha: f.fecha, categoria: f.categoria, descripcion, monto: valor, proveedor: proveedor === '' ? null : proveedor },
  };
}

/** Los campos que cambiaron respecto del gasto original (para el PATCH). Vacío = nada que guardar. */
export function cambiosDeGasto(original: DatosGasto, nuevo: DatosGasto): Partial<DatosGasto> {
  const cambios: Partial<DatosGasto> = {};
  if (nuevo.fecha !== original.fecha) cambios.fecha = nuevo.fecha;
  if (nuevo.categoria !== original.categoria) cambios.categoria = nuevo.categoria;
  if (nuevo.descripcion !== original.descripcion) cambios.descripcion = nuevo.descripcion;
  if (nuevo.monto !== original.monto) cambios.monto = nuevo.monto;
  if (nuevo.proveedor !== original.proveedor) cambios.proveedor = nuevo.proveedor;
  return cambios;
}

/** "1 gasto", "12 gastos". */
export const textoGastos = (n: number): string => `${new Intl.NumberFormat('es-AR').format(n)} ${n === 1 ? 'gasto' : 'gastos'}`;

/* ---------- Meta mensual ---------- */

export const ESTADOS_META = ['sin-meta', 'cumplida', 'adelantado', 'en-ritmo', 'atrasado'] as const;
export type EstadoMeta = (typeof ESTADOS_META)[number];

/** El estado dicho en palabras (nunca solo con color) y qué quiere decir. */
export const TEXTO_ESTADO_META: Readonly<Record<EstadoMeta, { titulo: string; detalle: string }>> = {
  'sin-meta': { titulo: 'Sin meta este mes', detalle: 'Fijá cuánto querés facturar y te mostramos cómo vas.' },
  cumplida: { titulo: 'Meta cumplida', detalle: 'Llegaste al objetivo de este mes.' },
  adelantado: { titulo: 'Vas adelantado', detalle: 'Estás por encima del ritmo que necesitás.' },
  'en-ritmo': { titulo: 'Vas en ritmo', detalle: 'Si seguís así, llegás justo a la meta.' },
  atrasado: { titulo: 'Vas atrasado', detalle: 'Estás por debajo del ritmo que necesitás.' },
};

/** El backend manda uno de los cinco; si mandara otro, se trata como "sin meta" en vez de inventar un estado. */
export const esEstadoMeta = (valor: string): valor is EstadoMeta => (ESTADOS_META as readonly string[]).includes(valor);

/** Ancho de la barra en %, entre 0 y 100 (una meta pasada de 100 % llena la barra; el número dice cuánto). */
export function anchoDeBarra(proporcion: number | null): number {
  if (proporcion === null || !Number.isFinite(proporcion)) return 0;
  return Math.min(100, Math.max(0, Math.round(proporcion * 1000) / 10));
}

/** "73 %" (entero, sin decimales: es una lectura rápida). */
export function textoAvance(proporcion: number | null): string {
  if (proporcion === null || !Number.isFinite(proporcion)) return '—';
  return `${String(Math.round(Math.max(0, proporcion) * 100))} %`;
}

export interface ProgresoMeta {
  ingresos: number;
  trabajos: number;
  porcentajeIngresos: number | null;
  porcentajeTrabajos: number | null;
  diasDeAtencionTranscurridos: number;
  diasDeAtencionRestantes: number;
  diasDeAtencionTotales: number;
  proyeccionIngresos: number | null;
  necesarioPorDia: number | null;
  estado: EstadoMeta;
}

export interface ObjetivosMeta {
  ingresosObjetivo: number | null;
  trabajosObjetivo: number | null;
}

/** "5 días de atención", "1 día de atención". */
export const textoDiasDeAtencion = (n: number): string => `${String(n)} ${n === 1 ? 'día' : 'días'} de atención`;

/**
 * Qué le falta a la meta, en una frase: "Te faltan $ 404.000, unos $ 80.800 por día de atención (5 días)". Si ya se
 * cumplió, lo dice; si no quedan días de atención, tampoco inventa un ritmo.
 */
export function fraseFaltante(meta: ObjetivosMeta, p: ProgresoMeta): string | null {
  if (meta.ingresosObjetivo === null) return null;
  if (p.estado === 'cumplida' || p.ingresos >= meta.ingresosObjetivo) return 'Ya llegaste a la meta de ingresos.';
  const falta = meta.ingresosObjetivo - p.ingresos;
  if (p.diasDeAtencionRestantes <= 0 || p.necesarioPorDia === null) {
    return `Te faltaron ${formatoPesos(falta)}: no quedan días de atención este mes.`;
  }
  return `Te faltan ${formatoPesos(falta)}: son unos ${formatoPesos(p.necesarioPorDia)} por día de atención (${textoDiasDeAtencion(p.diasDeAtencionRestantes)}).`;
}

/** "Si seguís a este ritmo, el mes cierra en unos $ 1.370.000." Null si todavía no hay base para proyectar. */
export function fraseProyeccion(p: ProgresoMeta): string | null {
  if (p.proyeccionIngresos === null) return null;
  return `Si seguís a este ritmo, el mes cierra en unos ${formatoPesos(p.proyeccionIngresos)}.`;
}

/** "Van 20 de 25 días de atención." */
export function fraseDias(p: ProgresoMeta): string {
  return `Van ${String(p.diasDeAtencionTranscurridos)} de ${textoDiasDeAtencion(p.diasDeAtencionTotales)}.`;
}

/** "32 de 40 trabajos". */
export function fraseTrabajos(trabajos: number, objetivo: number): string {
  return `${String(trabajos)} de ${String(objetivo)} ${objetivo === 1 ? 'trabajo' : 'trabajos'}`;
}

export const LIMITES_META = { ingresos: { min: 1, max: 999_999_999 }, trabajos: { min: 1, max: 9999 } } as const;

export type ErroresMeta = Partial<Record<'ingresosObjetivo' | 'trabajosObjetivo' | 'mes' | 'general', string>>;

export type ValidacionMeta =
  | { ok: true; datos: { ingresosObjetivo: number | null; trabajosObjetivo: number | null } }
  | { ok: false; errores: ErroresMeta };

/** Controla el formulario de la meta: al menos uno de los dos objetivos, enteros y dentro de los topes. */
export function validarMeta(ingresos: string, trabajos: string, mes: string, hoy: string): ValidacionMeta {
  const errores: ErroresMeta = {};
  if (!mesPermitidoParaMeta(mes, hoy)) errores.mes = 'Elegí un mes entre el año pasado y el año que viene.';

  let ingresosObjetivo: number | null = null;
  const leidoIngresos = leerPesos(ingresos, LIMITES_META.ingresos.max);
  if ('error' in leidoIngresos) errores.ingresosObjetivo = leidoIngresos.error;
  else if (leidoIngresos.valor !== null) {
    if (leidoIngresos.valor < LIMITES_META.ingresos.min) errores.ingresosObjetivo = 'La meta tiene que ser de al menos $ 1.';
    else if (leidoIngresos.valor > LIMITES_META.ingresos.max) {
      errores.ingresosObjetivo = `Es demasiado: el máximo es ${formatoPesos(LIMITES_META.ingresos.max)}.`;
    } else ingresosObjetivo = leidoIngresos.valor;
  }

  let trabajosObjetivo: number | null = null;
  const limpio = trabajos.trim();
  if (limpio !== '') {
    if (!/^\d+$/.test(limpio)) errores.trabajosObjetivo = 'Escribí solo números enteros, por ejemplo 40.';
    else {
      const n = Number(limpio);
      if (n < LIMITES_META.trabajos.min) errores.trabajosObjetivo = 'Tiene que ser al menos 1 trabajo.';
      else if (n > LIMITES_META.trabajos.max) errores.trabajosObjetivo = `Es demasiado: el máximo es ${String(LIMITES_META.trabajos.max)}.`;
      else trabajosObjetivo = n;
    }
  }

  if (!errores.ingresosObjetivo && !errores.trabajosObjetivo && ingresosObjetivo === null && trabajosObjetivo === null) {
    errores.general = 'Cargá al menos un objetivo: lo que querés facturar o cuántos trabajos querés hacer.';
  }
  return Object.keys(errores).length > 0 ? { ok: false, errores } : { ok: true, datos: { ingresosObjetivo, trabajosObjetivo } };
}

/** Lo que se muestra en un campo al editar una meta que ya existe. */
export const campoDeObjetivo = (valor: number | null): string => (valor === null ? '' : String(valor));

/* ---------- Historial de metas ---------- */

export type SituacionDeMes = 'cumplida' | 'no-cumplida' | 'en-curso' | 'programada';

export const TEXTO_SITUACION: Readonly<Record<SituacionDeMes, string>> = {
  cumplida: 'Cumplida',
  'no-cumplida': 'No se cumplió',
  'en-curso': 'En curso',
  programada: 'Programada',
};

/** Cómo se lee la meta de un mes según dónde está parado el calendario. */
export function situacionDeMes(mes: string, cumplida: boolean, hoy: string): SituacionDeMes {
  const distancia = mesesEntre(mesDeFecha(hoy), mes);
  if (distancia > 0) return 'programada';
  if (distancia === 0) return cumplida ? 'cumplida' : 'en-curso';
  return cumplida ? 'cumplida' : 'no-cumplida';
}
