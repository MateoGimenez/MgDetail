import type { ServicioId } from './api/contract';

/** Tipos del contenido editable de la web (servicios, galería, datos del taller). */

export interface Termino {
  readonly termino: string;
  readonly significado: string;
}

export interface Servicio {
  readonly id: ServicioId;
  readonly nombre: string;
  readonly resumen: string;
  readonly descripcion: string;
  readonly incluye: readonly string[];
  readonly duracion: string;
  readonly precioDesde: number | null;
  readonly destacado: boolean;
  /** Palabras técnicas del servicio, explicadas en una línea. */
  readonly glosario?: readonly Termino[];
}

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
}
