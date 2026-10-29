import type { DatosSitio } from '../types.ts';

/**
 * DATOS DEL TALLER — completalos acá y la web se actualiza sola.
 *
 * Todo lo que quede vacío se oculta: sin WhatsApp, los botones de contacto
 * llevan al formulario de turnos; sin horarios o dirección, esos bloques no
 * aparecen. No hace falta tocar ningún otro archivo.
 */
export const sitio: DatosSitio = {
  // COMPLETAR: WhatsApp en formato internacional, solo números y sin "+". Ej.: '5493804123456'
  whatsapp: '5493804781737',
  // COMPLETAR: usuario de Instagram, sin "@". Ej.: 'mgdetailing'
  instagram: '',
  // COMPLETAR: dirección del taller. Ej.: 'Av. Ejemplo 123, La Rioja'
  direccion: 'Calle Olta Pasaje N2, La Rioja',
  // COMPLETAR: horarios, un renglón por ítem. Ej.: ['Lunes a viernes, de 9 a 18 h', 'Sábados, de 9 a 13 h']
  horarios: ['Lunes a viernes, de 8 a 13 h y de 18 a 22 h', 'Sábados, de 9 a 21 h'],
  // Los mismos horarios, para calcular el "Abierto ahora" (hora de La Rioja). Día 0 = domingo … 6 = sábado;
  // una lista vacía = cerrado ese día. Si lo cambiás arriba, cambialo acá también. Sacá esta clave para no mostrar el estado.
  horariosSemana: {
    0: [],
    1: [{ desde: '08:00', hasta: '13:00' }, { desde: '18:00', hasta: '22:00' }],
    2: [{ desde: '08:00', hasta: '13:00' }, { desde: '18:00', hasta: '22:00' }],
    3: [{ desde: '08:00', hasta: '13:00' }, { desde: '18:00', hasta: '22:00' }],
    4: [{ desde: '08:00', hasta: '13:00' }, { desde: '18:00', hasta: '22:00' }],
    5: [{ desde: '08:00', hasta: '13:00' }, { desde: '18:00', hasta: '22:00' }],
    6: [{ desde: '09:00', hasta: '21:00' }],
  },
  // COMPLETAR: link de Google Maps del taller (en Maps: Compartir → Copiar vínculo).
  mapsUrl: 'https://maps.app.goo.gl/Kx6QbmpbXiunjVgB7',
  // OPCIONAL: mapa embebido. En Google Maps: Compartir → Insertar un mapa → copiá solo el valor de src="…" (empieza con
  // https://www.google.com/maps/embed). Se carga recién cuando la persona toca "Ver el mapa acá". Vacío: solo "Cómo llegar".
  mapaEmbedUrl: '',
  // COMPLETAR: dirección pública de la web, sin barra final. Ej.: 'https://mgdetailing.com.ar'
  // (se usa para canonical, og:url y, más adelante, og:image; vacía, esas etiquetas no se emiten)
  url: 'https://mgdetail.com.ar',
  // Logo plano para fondo oscuro, versión liviana generada con `npm run marca` (vacío: wordmark tipográfico).
  logo: '/marca/logo-fondo-oscuro.png',
  logoAncho: 303,
  logoAlto: 120,
};

/** Datos fijos de la marca. No cambiar. */
export const negocio = {
  nombre: 'MgDetailing',
  ciudad: 'La Rioja',
  provincia: 'La Rioja',
  pais: 'Argentina',
} as const;

/**
 * Archivos de marca que usa la web (originales en public/fotos/, versiones
 * livianas en public/marca/ con `npm run marca`).
 */
export const marca = {
  /**
   * Logo plano para fondo claro (tema claro de la web). Mismo recorte y tamaño que
   * `sitio.logo`; se usa solo si `sitio.logo` está cargado.
   */
  logoClaro: '/marca/logo-fondo-claro.png',
  /** Monograma 3D animado (1080 × 1080, 16 s). Se reproduce solo cuando se ve. */
  video: '/fotos/MgDetailing-monograma-3D.mp4',
  /** Cuadro fijo del monograma: póster del video y reemplazo con "menos movimiento". */
  poster: '/marca/monograma-poster.webp',
  /** Dorso del cuadro que gira: el logo 3D completo. */
  dorso: '/marca/monograma-dorso.webp',
  posterLado: 720,
} as const;
