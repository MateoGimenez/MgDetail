import type { Servicio } from '../types';
import { buscarServicio, servicioDeRespaldo, type IdDeRespaldo } from './servicios';

/**
 * PREGUNTAS FRECUENTES — editá los textos acá. Cada respuesta es una lista de
 * párrafos. Los nombres y duraciones de servicios salen del catálogo que muestra la web
 * (el de la API o, si no está, el respaldo de servicios.ts).
 */

export interface PreguntaFrecuente {
  pregunta: string;
  respuesta: readonly string[];
}

export function preguntasFrecuentes({
  conWhatsapp,
  catalogo,
}: {
  conWhatsapp: boolean;
  catalogo: readonly Servicio[];
}): PreguntaFrecuente[] {
  // Si el dueño renombra un servicio en el panel, la pregunta usa el nombre nuevo; si lo desactiva, el del respaldo.
  const servicio = (id: IdDeRespaldo) => buscarServicio(id, catalogo) ?? servicioDeRespaldo(id);
  const basico = servicio('lavado-basico');
  const premium = servicio('lavado-premium');
  const pulido = servicio('pulido');
  const ejemplos = [basico, pulido]
    .filter((s): s is Servicio & { duracion: string } => s.duracion !== null)
    .map((s, i) => `${s.nombre}, ${i === 0 ? s.duracion : s.duracion.toLowerCase()}`);

  return [
    {
      pregunta: '¿Qué es el detailing?',
      respuesta: [
        'Es el cuidado a fondo de un vehículo, por dentro y por fuera, prestando atención a cada detalle: limpieza profunda, corrección de la pintura y protección.',
        'Va más allá de un lavado común: busca recuperar y mantener el mejor estado posible de tu auto, camioneta o moto.',
      ],
    },
    {
      pregunta: `¿Qué diferencia hay entre el ${basico.nombre} y el ${premium.nombre}?`,
      respuesta: [
        `El ${basico.nombre} es un lavado exterior a mano bien hecho, más aspirado y vidrios.`,
        `El ${premium.nombre} suma una limpieza profunda del interior (tapizados, alfombras y plásticos), acondicionado de plásticos, descontaminación de llantas y una protección rápida para la pintura.`,
      ],
    },
    {
      pregunta: '¿Cada cuánto conviene encerar?',
      respuesta: [
        'Depende del uso, de si el vehículo duerme bajo techo y del clima. Una pista fácil: cuando el agua deja de formar gotitas sobre la pintura, la protección se está yendo.',
        'Contanos cómo usás tu vehículo y te recomendamos cada cuánto hacerlo.',
      ],
    },
    {
      pregunta: '¿Qué saca y qué no saca un pulido?',
      respuesta: [
        'Saca rayas finas, swirls (esas marcas circulares finitas que se ven con el sol) y la opacidad de la pintura.',
        'No saca las rayas profundas, las que llegan a la base de la pintura. Una prueba casera: pasá la uña, y si se engancha, probablemente sea profunda. Se pueden disimular, pero no desaparecen, y te lo decimos antes de empezar.',
      ],
    },
    {
      pregunta: '¿Por qué se ponen amarillentas las ópticas?',
      respuesta: [
        'Los faros de hoy son de policarbonato, un plástico que viene de fábrica con una capa protectora. Con el sol, esa capa se degrada y el faro se pone opaco y amarillento.',
        'Por eso, después de pulirlas, les aplicamos un sellado UV: una capa transparente que las protege del sol.',
      ],
    },
    {
      pregunta: '¿Hace falta sacar turno?',
      respuesta: [
        conWhatsapp
          ? 'Sí. Trabajamos con turno para dedicarle a cada vehículo el tiempo que necesita. Pedilo con el formulario o por WhatsApp, y te confirmamos el día y el horario.'
          : 'Sí. Trabajamos con turno para dedicarle a cada vehículo el tiempo que necesita. Pedilo con el formulario de esta página y te confirmamos el día y el horario.',
      ],
    },
    {
      pregunta: '¿Cuánto tarda cada servicio?',
      respuesta: [
        ejemplos.length > 0
          ? `Depende del servicio y del estado del vehículo. Por ejemplo: ${ejemplos.join('; ')}. En cada servicio vas a ver la duración estimada.`
          : 'Depende del servicio y del estado del vehículo. En cada servicio vas a ver la duración estimada.',
      ],
    },
    {
      pregunta: '¿Cuánto sale?',
      respuesta: [
        'Depende del tamaño y del estado del vehículo. Consultanos y te pasamos el precio antes de empezar: sin sorpresas.',
      ],
    },
  ];
}
