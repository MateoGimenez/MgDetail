import type { Servicio } from '../types';

/**
 * CATÁLOGO DE RESPALDO — los servicios ahora se editan desde el panel (/admin → Servicios) y la landing los lee de
 * GET /api/servicios. Esta lista se usa solo:
 *  - mientras la web carga el catálogo, y
 *  - si la API no responde: la web nunca queda sin servicios, pero sin precios (muestra "Consultá").
 *
 * Por eso no lleva `precioDesde`: los precios se cargan en el panel. Conviene que los textos de acá sigan
 * parecidos a los de la base (la migración del catálogo copió estos mismos), para que no "salte" el contenido
 * cuando llega la respuesta.
 *
 * PROVISIONAL: descripciones, lo que incluye cada servicio y las duraciones son una propuesta inicial que el
 * dueño todavía no confirmó (buscá "COMPLETAR: confirmar con el taller").
 */
type ServicioDeRespaldo = Omit<Servicio, 'precioDesde' | 'duracion'> & { readonly duracion: string };

const respaldo = [
  {
    id: 'lavado-basico',
    nombre: 'Lavado Básico',
    resumen: 'El lavado bien hecho: por fuera a mano, y por dentro aspirado y vidrios.',
    // COMPLETAR: confirmar con el taller
    descripcion:
      'Lavamos la carrocería a mano, con prelavado de espuma y el método de dos baldes, para sacar la tierra sin rayar la pintura. Es el lavado de mantenimiento: ideal para tener tu vehículo limpio entre tratamientos más profundos.',
    // COMPLETAR: confirmar con el taller
    incluye: [
      'Prelavado con espuma',
      'Lavado exterior a mano con método de dos baldes',
      'Llantas y neumáticos',
      'Secado con microfibra',
      'Aspirado del interior',
      'Vidrios por dentro y por fuera',
    ],
    // COMPLETAR: confirmar con el taller
    duracion: '1 a 1,5 h',
    destacado: false,
    glosario: [
      {
        termino: 'Prelavado con espuma',
        significado: 'una espuma que ablanda la tierra para que salga sin frotar de más.',
      },
      {
        termino: 'Método de dos baldes',
        significado:
          'un balde con shampoo y otro con agua limpia para enjuagar el guante, así la tierra no vuelve a la pintura y no la raya.',
      },
    ],
  },
  {
    id: 'lavado-premium',
    nombre: 'Lavado Premium',
    resumen: 'Todo el básico, más una limpieza a fondo del interior y una capa de protección para la pintura.',
    // COMPLETAR: confirmar con el taller
    descripcion:
      'Es el lavado completo. Además del exterior a mano, limpiamos en profundidad tapizados, alfombras y plásticos, descontaminamos las llantas y dejamos una protección rápida sobre la pintura. Para cuando tu vehículo necesita una puesta a punto de verdad.',
    // COMPLETAR: confirmar con el taller
    incluye: [
      'Todo lo del Lavado Básico',
      'Limpieza profunda de tapizados y alfombras',
      'Limpieza y acondicionado de plásticos',
      'Descontaminación de llantas',
      'Protección rápida de pintura (sellador o cera en spray)',
    ],
    // COMPLETAR: confirmar con el taller
    duracion: '3 a 4 h',
    destacado: true,
    glosario: [
      {
        termino: 'Acondicionado de plásticos',
        significado: 'un producto que limpia y nutre los plásticos para que no se resequen ni se pongan blanquecinos.',
      },
      {
        termino: 'Descontaminación de llantas',
        significado: 'sacar el polvo de freno que queda pegado y que con agua y shampoo no sale.',
      },
      {
        termino: 'Sellador o cera en spray',
        significado: 'una capa fina que da brillo y ayuda a que el agua y la tierra no se peguen tanto.',
      },
    ],
  },
  {
    id: 'pulido',
    nombre: 'Pulido',
    resumen: 'Corrección de pintura: saca rayas finas, marcas de lavado y opacidad para devolverle el brillo.',
    // COMPLETAR: confirmar con el taller
    descripcion:
      'Primero lavamos y descontaminamos la pintura con clay bar. Después la pulimos en una o dos etapas, según cómo esté. Te decimos la verdad antes de empezar: las rayas profundas, las que llegan a la base de la pintura, no se van con un pulido.',
    // COMPLETAR: confirmar con el taller
    incluye: [
      'Descontaminación de la pintura con clay bar',
      'Corrección de pintura en 1 o 2 etapas',
      'Eliminación de swirls y rayas finas',
      'Recuperación del brillo y la profundidad del color',
    ],
    // COMPLETAR: confirmar con el taller
    duracion: 'Alrededor de 1 día',
    destacado: false,
    glosario: [
      {
        termino: 'Corrección de pintura',
        significado: 'pulir la capa de barniz para emparejarla y sacar los defectos finos de la superficie.',
      },
      {
        termino: 'Swirls',
        significado: 'las marcas circulares finitas que se ven con el sol; casi siempre las deja un lavado mal hecho.',
      },
      {
        termino: 'Clay bar',
        significado: 'una arcilla especial que saca la suciedad pegada que el lavado no saca.',
      },
      {
        termino: 'Etapas',
        significado: 'cada pasada con un pulimento distinto: la primera corrige y la segunda afina el brillo.',
      },
    ],
  },
  {
    id: 'encerado',
    nombre: 'Encerado',
    resumen: 'Brillo profundo y una capa que protege la pintura del sol y del agua.',
    // COMPLETAR: confirmar con el taller
    descripcion:
      'Lavamos y descontaminamos la pintura, y después aplicamos la cera. Deja un brillo profundo, hace que el agua resbale en gotas y suma protección contra el sol. Cuánto dura depende del uso, de si el vehículo duerme bajo techo y del clima.',
    // COMPLETAR: confirmar con el taller
    incluye: [
      'Lavado previo',
      'Descontaminación de la pintura',
      'Aplicación de cera',
      'Brillo profundo y repelencia al agua',
      'Protección UV',
    ],
    // COMPLETAR: confirmar con el taller
    duracion: '2 a 3 h',
    destacado: false,
    glosario: [
      {
        termino: 'Descontaminación',
        significado: 'sacar la suciedad pegada (tierra, resina, polvo de freno) que el lavado común no saca.',
      },
      {
        termino: 'Repelencia al agua',
        significado: 'el agua forma gotitas y resbala, en lugar de quedarse pegada a la pintura.',
      },
      {
        termino: 'Protección UV',
        significado: 'una barrera contra los rayos del sol, que con el tiempo opacan y decoloran la pintura.',
      },
    ],
  },
  {
    id: 'restauracion-opticas',
    nombre: 'Restauración de ópticas',
    resumen: 'Faros opacos o amarillentos, otra vez claros: se ven mejor y ves mejor de noche.',
    // COMPLETAR: confirmar con el taller
    descripcion:
      'Lijamos al agua la capa dañada, pulimos hasta recuperar la transparencia y terminamos con un sellado UV para que el sol no las vuelva a castigar tan rápido. Mejora la estética y, sobre todo, la visibilidad cuando manejás de noche.',
    // COMPLETAR: confirmar con el taller
    incluye: ['Lijado al agua', 'Pulido de las ópticas', 'Sellado UV'],
    // COMPLETAR: confirmar con el taller
    duracion: '1,5 a 2 h',
    destacado: false,
    glosario: [
      {
        termino: 'Lijado al agua',
        significado: 'un lijado suave, con agua, que saca la capa amarillenta sin dañar el faro.',
      },
      {
        termino: 'Sellado UV',
        significado: 'una capa transparente que protege el faro del sol para que tarde más en volver a ponerse amarillo.',
      },
    ],
  },
] as const satisfies readonly ServicioDeRespaldo[];

/** Ids del respaldo: con ellos, las preguntas frecuentes pueden nombrar servicios con control en compilación. */
export type IdDeRespaldo = (typeof respaldo)[number]['id'];

/** El respaldo con la forma del catálogo público: siempre sin precio. */
export const serviciosDeRespaldo: readonly Servicio[] = respaldo.map((servicio) => ({ ...servicio, precioDesde: null }));

const PRECIO = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

/** "Desde $ 25.000", o "Consultá" si todavía no hay precio cargado. */
export function textoPrecio(precioDesde: number | null): string {
  return precioDesde === null ? 'Consultá' : `Desde ${PRECIO.format(precioDesde)}`;
}

/** Servicio de una lista por id (undefined si no está). */
export function buscarServicio(id: string, catalogo: readonly Servicio[] = serviciosDeRespaldo): Servicio | undefined {
  return catalogo.find((servicio) => servicio.id === id);
}

/** Servicio del respaldo por id (el tipo garantiza que existe). */
export function servicioDeRespaldo(id: IdDeRespaldo): Servicio {
  const servicio = buscarServicio(id);
  if (!servicio) throw new Error(`Falta el servicio "${id}" en el respaldo.`);
  return servicio;
}

/** Nombre legible de un servicio: el del catálogo, el del respaldo o, si no está en ninguno, el id tal cual. */
export function nombreDeServicio(id: string, catalogo: readonly Servicio[] = []): string {
  return buscarServicio(id, catalogo)?.nombre ?? buscarServicio(id)?.nombre ?? id;
}
