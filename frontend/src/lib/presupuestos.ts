import { formatoPesos, leerMonto } from './cobro';
import { fechaCorta } from './fechas';
import { leerCantidad } from './inventario';

/**
 * Presupuestos (reportes/2026-10-27_17_finanzas-inventario-documentos.md) en funciones puras: las mismas cuentas
 * que el backend, validación del editor de ítems, lectura del teléfono para wa.me y el texto de WhatsApp.
 * Un presupuesto NO es una factura: así lo dice el PDF.
 */

export const ESTADOS_PRESUPUESTO = ['borrador', 'enviado', 'aceptado', 'rechazado'] as const;
export type EstadoPresupuesto = (typeof ESTADOS_PRESUPUESTO)[number];

export const esEstadoPresupuesto = (valor: string): valor is EstadoPresupuesto =>
  (ESTADOS_PRESUPUESTO as readonly string[]).includes(valor);

export const ETIQUETA_ESTADO_PRESUPUESTO: Readonly<Record<EstadoPresupuesto, string>> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
};

export const LIMITES_PRESUPUESTO = {
  clienteNombre: 80,
  vehiculo: 80,
  telefono: 30,
  items: 30,
  descripcion: 120,
  cantidadMax: 999,
  precioMax: 99_999_999,
  validezMin: 1,
  validezMax: 90,
  validezPorDefecto: 7,
  notas: 500,
} as const;

/* ---------- Cuentas (idénticas al backend) ---------- */

export interface ItemPresupuesto {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

/**
 * `round(cantidad × precioUnitario)`. La cantidad tiene 2 decimales como mucho: se pasa a centésimas enteras antes
 * de multiplicar para que 2,35 × 100 no dé 234,99999999999997.
 */
export function importeDeItem(item: Pick<ItemPresupuesto, 'cantidad' | 'precioUnitario'>): number {
  const centesimas = Math.round(item.cantidad * 100);
  // Mismo cálculo entero que el backend (domain/presupuestos.ts): .5 siempre hacia arriba.
  return Math.floor((centesimas * item.precioUnitario + 50) / 100);
}

export const subtotalDe = (items: readonly Pick<ItemPresupuesto, 'cantidad' | 'precioUnitario'>[]): number =>
  items.reduce((suma, item) => suma + importeDeItem(item), 0);

/** `max(0, subtotal − descuento)`. */
export const totalDe = (subtotal: number, descuento: number): number => Math.max(0, subtotal - descuento);

/** "1 ítem", "3 ítems". */
export const textoItems = (cantidad: number): string => (cantidad === 1 ? '1 ítem' : `${String(cantidad)} ítems`);

/* ---------- Teléfono para wa.me ---------- */

/**
 * Deja un teléfono listo para `wa.me/<número>`: solo dígitos, con código de país. Entiende lo que se escribe en
 * La Rioja: "380 478-1737", "0380 15 478 1737", "+54 9 380 478 1737". Un número que ya viene con otro código de
 * país (8 a 15 dígitos) se respeta. null si no se puede armar.
 */
export function normalizarTelefono(texto: string): string | null {
  let d = texto.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length < 8) return null;

  if (d.startsWith('54')) {
    // +54 9 AAA NNNNNNN (13) está completo; +54 AAA NNNNNNN (12) lleva el 9 de celulares.
    if (d.length === 13 && d[2] === '9') return d;
    if (d.length === 12) return `549${d.slice(2)}`;
    return d.length <= 15 ? d : null;
  }
  // Nacional: 0 de larga distancia y 15 de celular antes del número.
  const sinCero = d.startsWith('0') ? d.slice(1) : d;
  if (sinCero.length === 12) {
    for (const corte of [2, 3, 4]) {
      if (sinCero.slice(corte, corte + 2) === '15') {
        return `549${sinCero.slice(0, corte)}${sinCero.slice(corte + 2)}`;
      }
    }
  }
  if (sinCero.length === 10) return `549${sinCero}`;
  return d.length <= 15 ? d : null;
}

/** Enlace a WhatsApp con un texto armado, o null si el teléfono no sirve. */
export function whatsappPresupuestoUrl(telefono: string | null, mensaje: string): string | null {
  const numero = telefono ? normalizarTelefono(telefono) : null;
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null;
}

/* ---------- Mensaje de WhatsApp ---------- */

interface DatosMensaje {
  codigo: string;
  clienteNombre: string;
  vehiculo: string | null;
  total: number;
  validezDias: number;
  venceEl: string;
}

/** Primer nombre de "Juan Pérez": para saludar sin sonar a formulario. */
export const primerNombre = (nombre: string): string => nombre.trim().split(/\s+/)[0] ?? '';

/**
 * Texto prearmado en voseo. El PDF no viaja con el enlace: se manda aparte (el mensaje lo avisa).
 */
export function mensajeDePresupuesto(p: DatosMensaje, nombreTaller: string): string {
  const saludo = primerNombre(p.clienteNombre);
  const por = p.vehiculo ? ` para tu ${p.vehiculo}` : '';
  return [
    `Hola${saludo ? ` ${saludo}` : ''}! Te paso el presupuesto ${p.codigo} de ${nombreTaller}${por}.`,
    `El total es ${formatoPesos(p.total)} y vale hasta el ${fechaCorta(p.venceEl)} (${p.validezDias} ${p.validezDias === 1 ? 'día' : 'días'}).`,
    'Ahora te mando el PDF con el detalle. Si querés que lo agendemos o cambiar algo, avisame.',
  ].join('\n');
}

/* ---------- Editor de ítems ---------- */

/** Un renglón del editor: lo que la persona escribió, sin interpretar. */
export interface RenglonItem {
  /** Estable para React; no viaja al backend. */
  clave: number;
  descripcion: string;
  cantidad: string;
  precio: string;
}

export const renglonVacio = (clave: number): RenglonItem => ({ clave, descripcion: '', cantidad: '1', precio: '' });

export const renglonDesdeItem = (item: ItemPresupuesto, clave: number): RenglonItem => ({
  clave,
  descripcion: item.descripcion,
  cantidad: String(item.cantidad).replace('.', ','),
  precio: String(item.precioUnitario),
});

export type ErroresPresupuesto = Record<string, string>;

/** Lectura "suave" de un renglón para el total en vivo: lo que no se entiende todavía vale 0. */
export function itemEnVivo(r: RenglonItem): Pick<ItemPresupuesto, 'cantidad' | 'precioUnitario'> {
  const cantidad = leerCantidad(r.cantidad, { max: LIMITES_PRESUPUESTO.cantidadMax });
  const precio = leerMonto(r.precio);
  return {
    cantidad: 'valor' in cantidad ? cantidad.valor : 0,
    precioUnitario: 'valor' in precio && precio.valor !== null ? precio.valor : 0,
  };
}

export const totalEnVivo = (renglones: readonly RenglonItem[], descuentoTexto: string): { subtotal: number; descuento: number; total: number } => {
  const subtotal = subtotalDe(renglones.map(itemEnVivo));
  const lectura = leerMonto(descuentoTexto);
  const descuento = 'valor' in lectura && lectura.valor !== null ? lectura.valor : 0;
  return { subtotal, descuento, total: totalDe(subtotal, descuento) };
};

export interface FormularioPresupuesto {
  clienteNombre: string;
  clienteTelefono: string;
  vehiculo: string;
  renglones: RenglonItem[];
  descuento: string;
  validezDias: string;
  notas: string;
}

export interface DatosPresupuesto {
  clienteNombre: string;
  clienteTelefono: string | null;
  vehiculo: string | null;
  items: ItemPresupuesto[];
  descuento: number;
  validezDias: number;
  notas: string | null;
}

const largo = (texto: string) => Array.from(texto).length;
const L = LIMITES_PRESUPUESTO;

/**
 * Valida el editor con las reglas del contrato. Las claves de error son las del backend (`clienteNombre`,
 * `items.2.cantidad`…) para que un `fields` del servidor caiga en el mismo campo.
 */
export function validarPresupuesto(
  f: FormularioPresupuesto,
): { ok: true; datos: DatosPresupuesto } | { ok: false; errores: ErroresPresupuesto } {
  const errores: ErroresPresupuesto = {};

  const clienteNombre = f.clienteNombre.trim();
  if (clienteNombre === '') errores.clienteNombre = 'Escribí el nombre del cliente.';
  else if (largo(clienteNombre) > L.clienteNombre) errores.clienteNombre = `Máximo ${String(L.clienteNombre)} caracteres.`;

  const telefonoCrudo = f.clienteTelefono.trim();
  let clienteTelefono: string | null = null;
  if (telefonoCrudo !== '') {
    const numero = normalizarTelefono(telefonoCrudo);
    if (numero === null || largo(telefonoCrudo) > L.telefono) {
      errores.clienteTelefono = 'No pudimos leer el teléfono. Escribilo con el código de área, por ejemplo 380 478-1737.';
    } else {
      clienteTelefono = numero;
    }
  }

  const vehiculo = f.vehiculo.trim();
  if (largo(vehiculo) > L.vehiculo) errores.vehiculo = `Máximo ${String(L.vehiculo)} caracteres.`;

  const items: ItemPresupuesto[] = [];
  if (f.renglones.length === 0) errores.items = 'Agregá al menos un ítem.';
  else if (f.renglones.length > L.items) errores.items = `Máximo ${String(L.items)} ítems.`;
  f.renglones.forEach((r, i) => {
    const descripcion = r.descripcion.trim();
    let valido = true;
    if (descripcion === '') {
      errores[`items.${String(i)}.descripcion`] = 'Escribí qué es.';
      valido = false;
    } else if (largo(descripcion) > L.descripcion) {
      errores[`items.${String(i)}.descripcion`] = `Máximo ${String(L.descripcion)} caracteres.`;
      valido = false;
    }
    const cantidad = leerCantidad(r.cantidad, { max: L.cantidadMax });
    if ('error' in cantidad) {
      errores[`items.${String(i)}.cantidad`] = cantidad.error;
      valido = false;
    }
    const precio = leerMonto(r.precio);
    if ('error' in precio) {
      errores[`items.${String(i)}.precioUnitario`] = precio.error;
      valido = false;
    } else if (precio.valor === null) {
      errores[`items.${String(i)}.precioUnitario`] = 'Escribí el precio (0 si va sin cargo).';
      valido = false;
    } else if (precio.valor > L.precioMax) {
      errores[`items.${String(i)}.precioUnitario`] = 'El precio es demasiado alto.';
      valido = false;
    }
    if (valido && 'valor' in cantidad && 'valor' in precio && precio.valor !== null) {
      items.push({ descripcion, cantidad: cantidad.valor, precioUnitario: precio.valor });
    }
  });

  let descuento = 0;
  const lecturaDescuento = leerMonto(f.descuento);
  if ('error' in lecturaDescuento) errores.descuento = lecturaDescuento.error;
  else descuento = lecturaDescuento.valor ?? 0;

  let validezDias: number = L.validezPorDefecto;
  const validezTexto = f.validezDias.trim();
  if (validezTexto !== '') {
    const n = /^\d+$/.test(validezTexto) ? Number(validezTexto) : NaN;
    if (!Number.isInteger(n) || n < L.validezMin || n > L.validezMax) {
      errores.validezDias = `Poné entre ${String(L.validezMin)} y ${String(L.validezMax)} días.`;
    } else {
      validezDias = n;
    }
  }

  const notas = f.notas.trim();
  if (largo(notas) > L.notas) errores.notas = `Máximo ${String(L.notas)} caracteres.`;

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return {
    ok: true,
    datos: {
      clienteNombre,
      clienteTelefono,
      vehiculo: vehiculo === '' ? null : vehiculo,
      items,
      descuento,
      validezDias,
      notas: notas === '' ? null : notas,
    },
  };
}

/** Cuerpo del POST: los opcionales vacíos no se mandan. */
export function cuerpoDeAlta(d: DatosPresupuesto) {
  return {
    clienteNombre: d.clienteNombre,
    ...(d.clienteTelefono ? { clienteTelefono: d.clienteTelefono } : {}),
    ...(d.vehiculo ? { vehiculo: d.vehiculo } : {}),
    items: d.items,
    descuento: d.descuento,
    validezDias: d.validezDias,
    ...(d.notas ? { notas: d.notas } : {}),
  };
}

/** Cuerpo del PATCH: solo lo que cambió; un opcional que se vació va como null. `null` si no cambió nada. */
export function cuerpoDeCambios(
  original: {
    clienteNombre: string;
    clienteTelefono: string | null;
    vehiculo: string | null;
    items: readonly ItemPresupuesto[];
    descuento: number;
    validezDias: number;
    notas: string | null;
  },
  d: DatosPresupuesto,
): Record<string, unknown> | null {
  const cambios: Record<string, unknown> = {};
  if (d.clienteNombre !== original.clienteNombre) cambios.clienteNombre = d.clienteNombre;
  // El teléfono guardado puede tener otro formato (con espacios): se compara por sus dígitos.
  const guardado = original.clienteTelefono ? (normalizarTelefono(original.clienteTelefono) ?? original.clienteTelefono) : null;
  if (d.clienteTelefono !== guardado) cambios.clienteTelefono = d.clienteTelefono;
  if (d.vehiculo !== original.vehiculo) cambios.vehiculo = d.vehiculo;
  const mismosItems =
    d.items.length === original.items.length &&
    d.items.every((it, i) => {
      const o = original.items[i];
      return o !== undefined && o.descripcion === it.descripcion && o.cantidad === it.cantidad && o.precioUnitario === it.precioUnitario;
    });
  if (!mismosItems) cambios.items = d.items;
  if (d.descuento !== original.descuento) cambios.descuento = d.descuento;
  if (d.validezDias !== original.validezDias) cambios.validezDias = d.validezDias;
  if (d.notas !== original.notas) cambios.notas = d.notas;
  return Object.keys(cambios).length === 0 ? null : cambios;
}

/** Texto de un servicio del catálogo en el selector: "Pulido · Desde $ 60.000". */
export function etiquetaDeServicio(nombre: string, precioDesde: number | null): string {
  return precioDesde !== null && precioDesde > 0 ? `${nombre} · Desde ${formatoPesos(precioDesde)}` : nombre;
}

/* ---------- Lista ---------- */

export const FILTROS_PRESUPUESTO = ['todos', ...ESTADOS_PRESUPUESTO] as const;
export type FiltroPresupuesto = (typeof FILTROS_PRESUPUESTO)[number];

/** El estado que se manda a la lista (`estado=`); "todos" no manda nada. */
export const estadoDeFiltro = (filtro: FiltroPresupuesto): EstadoPresupuesto | undefined => (filtro === 'todos' ? undefined : filtro);

/** "Vence el 3 nov" o, si ya pasó y sigue abierto, "Venció el 3 nov". */
export function textoDeVencimiento(p: { venceEl: string; vencido: boolean; estado: EstadoPresupuesto }): string | null {
  if (p.estado === 'aceptado' || p.estado === 'rechazado') return null;
  return `${p.vencido ? 'Venció' : 'Vence'} el ${fechaCorta(p.venceEl)}`;
}

/** Aviso al cambiar de estado: "P-0007 pasó a Aceptado." */
export const avisoDeEstado = (codigo: string, estado: EstadoPresupuesto): string =>
  `${codigo} pasó a ${ETIQUETA_ESTADO_PRESUPUESTO[estado]}.`;

export const CODIGO_PRESUPUESTO_ACEPTADO = 'PRESUPUESTO_ACEPTADO';
export const MENSAJE_PRESUPUESTO_ACEPTADO =
  'Un presupuesto aceptado no se borra. Si ya no vale, pasalo a Rechazado.';
