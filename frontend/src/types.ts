import type { ServicioId, ServicioPublico } from './api/contract';

/** Tipos del contenido editable de la web (servicios, galería, datos del taller). */

export interface Termino {
  readonly termino: string;
  readonly significado: string;
}

/**
 * Servicio tal como lo muestra la landing: el mismo dato que GET /api/servicios (los campos públicos del contrato),
 * de solo lectura. El catálogo se edita desde el panel; src/data/servicios.ts es el respaldo.
 */
export type Servicio = Readonly<Omit<ServicioPublico, 'incluye' | 'glosario'>> & {
  readonly incluye: readonly string[];
  /** Palabras técnicas del servicio, explicadas en una línea. */
  readonly glosario: readonly Termino[];
};

export interface FotoGaleria {
  /** Ruta dentro de public, ej.: '/fotos/hilux-pulido.jpg'. */
  readonly src: string;
  /** Qué se ve en la foto. */
  readonly alt: string;
  /** Texto corto que aparece debajo, ej.: 'Toyota Hilux · Pulido'. */
  readonly titulo?: string;
  readonly servicioId?: ServicioId;
}

export interface ParAntesDespues {
  readonly antes: string;
  readonly despues: string;
  /** Qué se ve en las dos fotos (sin "antes" ni "después"). */
  readonly alt: string;
  readonly titulo?: string;
  readonly servicioId?: ServicioId;
}

export interface DatosSitio {
  /** WhatsApp en formato internacional: solo números, sin "+" ni espacios. */
  readonly whatsapp: string;
  /** Usuario de Instagram, sin "@". */
  readonly instagram: string;
  /** Dirección del taller, tal como querés que se lea. */
  readonly direccion: string;
  /** Horarios de atención, un renglón por ítem. */
  readonly horarios: readonly string[];
  /** Link de Google Maps del taller. */
  readonly mapsUrl: string;
  /** Dirección pública de la web, sin barra final (ej.: 'https://mgdetailing.com.ar'). Vacía: no se emiten canonical ni og:url. */
  readonly url: string;
  /** Ruta del logo dentro de public, ej.: '/logo.png'. Vacío: se muestra el logo tipográfico. */
  readonly logo: string;
  /** Tamaño real del archivo del logo en píxeles (evita saltos al cargar). 0 si no se sabe. */
  readonly logoAncho: number;
  readonly logoAlto: number;
}
