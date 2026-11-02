import * as z from 'zod/mini';
import { SLUG_SERVICIO, VEHICULO_TIPOS, type VehiculoTipo } from '../api/contract';
import { LIMITES_SERVICIO, type CambiosServicio, type NuevoServicio, type ServicioPanel } from '../api/contract-panel';

/**
 * Validación del formulario de servicios con las mismas reglas que el backend
 * (reportes/2026-10-22_07_catalogo-editable.md). La regla real la aplica el backend (400 VALIDATION_ERROR con
 * fields); las claves de error son las mismas que usa él: "nombre", "incluye.2", "glosario.0.termino".
 */

const L = LIMITES_SERVICIO;
const n = (valor: number) => valor.toLocaleString('es-AR');

/** Lo que se edita en el diálogo: todo texto, como sale de los campos. */
export interface FormularioServicio {
  id: string;
  nombre: string;
  resumen: string;
  descripcion: string;
  incluye: string[];
  glosario: { termino: string; significado: string }[];
  duracion: string;
  /** Vacío = misma que auto. */
  duracionCamioneta: string;
  duracionMoto: string;
  /** Tal como lo escribió: "25000", "25.000" o "$ 25.000". Vacío = "Consultá". */
  precio: string;
  precioCamioneta: string;
  precioMoto: string;
  /** Para qué vehículos se ofrece (al menos uno). */
  vehiculos: VehiculoTipo[];
  destacado: boolean;
  activo: boolean;
}

/** Campos de precio de la API, en el orden auto, camioneta, moto, y el campo del formulario de cada uno. */
export const CAMPOS_PRECIO = ['precioDesde', 'precioDesdeCamioneta', 'precioDesdeMoto'] as const;
const CLAVE_FORMULARIO = {
  precioDesde: 'precio',
  precioDesdeCamioneta: 'precioCamioneta',
  precioDesdeMoto: 'precioMoto',
} as const satisfies Record<(typeof CAMPOS_PRECIO)[number], keyof FormularioServicio>;
const textoDePrecio = (precio: number | null) => (precio === null ? '' : String(precio));

export type ErroresServicio = Readonly<Record<string, string>>;

/*
 * Caracteres de control: igual que el backend (schemas/servicios.ts), todos los textos son de UNA línea salvo la
 * descripción, que admite saltos de línea y tabulaciones. El resumen y el significado se escriben en un <textarea>
 * (por comodidad, para ver el texto entero), así que un Enter ahí se avisa acá y no como un 400 del servidor.
 * Los controles bidireccionales no se rechazan: el backend los quita.
 */
const CONTROL_UNA_LINEA = /\p{Cc}/u;
const CONTROL_VARIAS_LINEAS = /[^\P{Cc}\t\n\r]/u;
const SIN_SALTOS = 'Escribilo en una sola línea, sin saltos de línea ni caracteres especiales.';
const SIN_CONTROL = 'Tiene caracteres que no se permiten.';

/** Precio en pesos: entero de 0 al tope, o null ("Consultá"). Mismos mensajes para los tres tipos de vehículo. */
const precioOpcional = (max: number) =>
  z.nullable(
    z
      .int('Escribí el precio en pesos, sin centavos.')
      .check(z.gte(0, 'El precio no puede ser negativo.'), z.lte(max, `El precio puede ser hasta $ ${n(max)}.`)),
  );

const texto = (max: number, vacio: string, largo: string, variasLineas = false) =>
  z
    .string()
    .check(
      z.trim(),
      z.minLength(1, vacio),
      z.maxLength(max, largo),
      variasLineas
        ? z.refine((v) => !CONTROL_VARIAS_LINEAS.test(v), SIN_CONTROL)
        : z.refine((v) => !CONTROL_UNA_LINEA.test(v), SIN_SALTOS),
    );

/** Duración: una línea, hasta el máximo; vacío = null (en camioneta y moto: la misma que auto). */
const duracionOpcional = (max: number) =>
  z.pipe(
    z
      .string()
      .check(
        z.trim(),
        z.maxLength(max, `La duración puede tener hasta ${n(max)} caracteres.`),
        z.refine((v) => !CONTROL_UNA_LINEA.test(v), SIN_SALTOS),
      ),
    z.transform((valor) => (valor === '' ? null : valor)),
  );

export const esquemaServicio = z.strictObject({
  id: z
    .string()
    .check(
      z.trim(),
      z.minLength(1, 'Escribí el identificador.'),
      z.maxLength(L.id.max, `El identificador puede tener hasta ${n(L.id.max)} caracteres.`),
      z.regex(SLUG_SERVICIO, 'Usá solo minúsculas sin tildes, números y guiones entre palabras (ej.: lavado-de-motor).'),
    ),
  nombre: texto(L.nombre.max, 'Escribí el nombre del servicio.', `El nombre puede tener hasta ${n(L.nombre.max)} caracteres.`),
  resumen: texto(L.resumen.max, 'Escribí un resumen de una línea.', `El resumen puede tener hasta ${n(L.resumen.max)} caracteres.`),
  descripcion: texto(
    L.descripcion.max,
    'Escribí la descripción.',
    `La descripción puede tener hasta ${n(L.descripcion.max)} caracteres.`,
    true,
  ),
  incluye: z
    .array(texto(L.incluye.max, 'Escribí qué incluye o quitá este renglón.', `Cada ítem puede tener hasta ${n(L.incluye.max)} caracteres.`))
    .check(z.maxLength(L.incluye.items, `Puede incluir hasta ${n(L.incluye.items)} ítems.`)),
  glosario: z
    .array(
      z.strictObject({
        termino: texto(L.glosario.termino, 'Escribí el término o quitá esta entrada.', `El término puede tener hasta ${n(L.glosario.termino)} caracteres.`),
        significado: texto(
          L.glosario.significado,
          'Explicá el término en una línea.',
          `La explicación puede tener hasta ${n(L.glosario.significado)} caracteres.`,
        ),
      }),
    )
    .check(z.maxLength(L.glosario.items, `El glosario puede tener hasta ${n(L.glosario.items)} términos.`)),
  duracion: duracionOpcional(L.duracion.max),
  duracionCamioneta: duracionOpcional(L.duracionCamioneta.max),
  duracionMoto: duracionOpcional(L.duracionMoto.max),
  precioDesde: precioOpcional(L.precioDesde.max),
  precioDesdeCamioneta: precioOpcional(L.precioDesdeCamioneta.max),
  precioDesdeMoto: precioOpcional(L.precioDesdeMoto.max),
  vehiculos: z
    .array(z.enum(VEHICULO_TIPOS))
    .check(z.minLength(1, 'Elegí al menos un vehículo: un servicio sin vehículos no se ve en la web (para eso está «Desactivar»).')),
  destacado: z.boolean(),
  activo: z.boolean(),
});

/** Mismo texto que el backend (fields.destacado): un servicio inactivo no puede ser el destacado. */
export const MENSAJE_DESTACADO_INACTIVO = 'No se puede destacar un servicio inactivo. Activalo primero.';

/** Ids que el backend no acepta al crear (son segmentos de ruta de /api/admin/servicios/). */
const IDS_RESERVADOS: readonly string[] = ['orden'];

/** "25.000", "$ 25.000" o "25000" → 25000; vacío → null; cualquier otra cosa → undefined (no es un precio). */
export function leerPrecio(valor: string): number | null | undefined {
  const limpio = valor.replace(/[\s$.]/g, '');
  if (limpio === '') return null;
  return /^\d+$/.test(limpio) ? Number(limpio) : undefined;
}

export type Validacion = { ok: true; datos: NuevoServicio } | { ok: false; errores: ErroresServicio };

export function validarServicio(formulario: FormularioServicio): Validacion {
  const precios = {
    precioDesde: leerPrecio(formulario[CLAVE_FORMULARIO.precioDesde]),
    precioDesdeCamioneta: leerPrecio(formulario[CLAVE_FORMULARIO.precioDesdeCamioneta]),
    precioDesdeMoto: leerPrecio(formulario[CLAVE_FORMULARIO.precioDesdeMoto]),
  };
  const resultado = z.safeParse(esquemaServicio, {
    id: formulario.id,
    nombre: formulario.nombre,
    resumen: formulario.resumen,
    descripcion: formulario.descripcion,
    incluye: formulario.incluye,
    glosario: formulario.glosario,
    duracion: formulario.duracion,
    duracionCamioneta: formulario.duracionCamioneta,
    duracionMoto: formulario.duracionMoto,
    precioDesde: precios.precioDesde ?? null,
    precioDesdeCamioneta: precios.precioDesdeCamioneta ?? null,
    precioDesdeMoto: precios.precioDesdeMoto ?? null,
    // En el orden de siempre (auto, camioneta, moto), como lo devuelve el backend.
    vehiculos: VEHICULO_TIPOS.filter((tipo) => formulario.vehiculos.includes(tipo)),
    destacado: formulario.destacado,
    activo: formulario.activo,
  });

  const errores: Record<string, string> = {};
  for (const campo of CAMPOS_PRECIO) {
    if (precios[campo] === undefined) errores[campo] = 'Escribí el precio en pesos, solo números (ej.: 25000). Vacío muestra «Consultá».';
  }
  if (formulario.destacado && !formulario.activo) errores.destacado = MENSAJE_DESTACADO_INACTIVO;
  if (IDS_RESERVADOS.includes(formulario.id.trim())) errores.id = 'Ese identificador está reservado. Elegí otro.';
  if (!resultado.success) {
    for (const issue of resultado.error.issues) {
      const clave = issue.path.map(String).join('.');
      errores[clave] ??= issue.message;
    }
  }
  if (resultado.success && Object.keys(errores).length === 0) return { ok: true, datos: resultado.data };
  return { ok: false, errores };
}

/** Slug sugerido a partir del nombre: "Lavado de motor" → "lavado-de-motor" (sin tildes ni ñ). */
export function sugerirSlug(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, L.id.max)
    .replace(/-+$/, '');
}

export function formularioVacio(vehiculo?: VehiculoTipo): FormularioServicio {
  return {
    id: '',
    nombre: '',
    resumen: '',
    descripcion: '',
    incluye: [],
    glosario: [],
    duracion: '',
    duracionCamioneta: '',
    duracionMoto: '',
    precio: '',
    precioCamioneta: '',
    precioMoto: '',
    // Desde una pestaña de vehículo, ese vehículo es el único marcado; sin pestaña, los tres.
    vehiculos: vehiculo ? [vehiculo] : [...VEHICULO_TIPOS],
    destacado: false,
    activo: true,
  };
}

export function formularioDesde(servicio: ServicioPanel): FormularioServicio {
  return {
    id: servicio.id,
    nombre: servicio.nombre,
    resumen: servicio.resumen,
    descripcion: servicio.descripcion,
    incluye: [...servicio.incluye],
    glosario: servicio.glosario.map((t) => ({ ...t })),
    duracion: servicio.duracion ?? '',
    duracionCamioneta: servicio.duracionCamioneta ?? '',
    duracionMoto: servicio.duracionMoto ?? '',
    precio: textoDePrecio(servicio.precioDesde),
    precioCamioneta: textoDePrecio(servicio.precioDesdeCamioneta),
    precioMoto: textoDePrecio(servicio.precioDesdeMoto),
    vehiculos: [...servicio.vehiculos],
    destacado: servicio.destacado,
    activo: servicio.activo,
  };
}

const CAMPOS_EDITABLES = [
  'nombre',
  'resumen',
  'descripcion',
  'incluye',
  'glosario',
  'duracion',
  'duracionCamioneta',
  'duracionMoto',
  'precioDesde',
  'precioDesdeCamioneta',
  'precioDesdeMoto',
  'vehiculos',
  'destacado',
  'activo',
] as const satisfies readonly (keyof CambiosServicio)[];

/** Solo lo que cambió respecto del servicio guardado (PATCH parcial). Un objeto vacío = no hay nada que guardar. */
export function cambiosDe(original: ServicioPanel, datos: NuevoServicio): CambiosServicio {
  const cambios: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITABLES) {
    if (JSON.stringify(original[campo]) !== JSON.stringify(datos[campo])) cambios[campo] = datos[campo];
  }
  return cambios;
}
