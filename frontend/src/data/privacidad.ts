/**
 * Texto de la política de privacidad (/privacidad). BORRADOR para que lo revise el dueño.
 *
 * Todo lo que dice sale de lo que el sistema hace de verdad (formulario de turno, seguimiento /turno/:id, panel,
 * avisos y recordatorios opcionales). Si cambia el sistema, cambiá acá el texto y `PRIVACIDAD_ACTUALIZADA`.
 *
 * Pendientes para el dueño (NO se muestran en la página; no se inventó ningún dato):
 *  - [COMPLETAR] Razón social / nombre del titular y CUIT del taller.
 *  - [COMPLETAR] Un email de contacto para pedidos de datos (hoy el contacto es WhatsApp y la dirección del taller).
 *  - [COMPLETAR] Si corresponde, número de inscripción del banco de datos ante la AAIP.
 *  - [COMPLETAR] Plazo de conservación si el taller quiere fijar uno (hoy el sistema no borra nada solo).
 */

/** Última vez que se revisó el texto (AAAA-MM-DD). */
export const PRIVACIDAD_ACTUALIZADA = '2026-10-29';

export interface SeccionPrivacidad {
  readonly id: string;
  readonly titulo: string;
  readonly parrafos: readonly string[];
  readonly lista?: readonly string[];
  /** Párrafos que van después de la lista. */
  readonly cierre?: readonly string[];
}

export interface ContextoPrivacidad {
  readonly nombre: string;
  readonly ciudad: string;
  readonly pais: string;
  readonly direccion: string;
  /** Hay WhatsApp cargado (la página muestra el enlace). */
  readonly conWhatsapp: boolean;
  /** Hay mapa embebido configurado (se carga recién al tocar "Ver el mapa acá"). */
  readonly conMapaEmbebido: boolean;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/** Fecha AAAA-MM-DD como "29 de octubre de 2026". */
export function fechaDePrivacidad(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number);
  const nombreMes = MESES[(mes ?? 0) - 1];
  if (!anio || !dia || !nombreMes) return iso;
  return `${String(dia)} de ${nombreMes} de ${String(anio)}`;
}

export function seccionesPrivacidad(c: ContextoPrivacidad): readonly SeccionPrivacidad[] {
  const contacto = [
    c.conWhatsapp ? 'Escribinos por WhatsApp: en esta página tenés el botón.' : null,
    c.direccion ? `O pasá por el taller: ${c.direccion}.` : null,
  ].filter((x): x is string => x !== null);

  const terceros: string[] = [
    'Supabase: guarda la base de datos (los turnos) y maneja el inicio de sesión del equipo.',
    'Render: es el servicio donde está alojada la web. Como cualquier servidor, puede registrar datos técnicos de la conexión (por ejemplo, la dirección IP).',
    'WhatsApp e Instagram: son solo enlaces. Si los tocás, ya estás en esas aplicaciones y rigen sus propias políticas.',
  ];
  if (c.conMapaEmbebido) {
    terceros.push(
      'Google Maps: el mapa de "Dónde estamos" no se carga hasta que tocás "Ver el mapa acá"; recién ahí Google recibe tu visita.',
    );
  }

  return [
    {
      id: 'responsable',
      titulo: 'Quién se encarga de tus datos',
      parrafos: [
        `${c.nombre}, taller de detailing de ${c.ciudad}, ${c.pais}, es quien decide para qué se usan los datos que dejás en esta web.`,
        ...contacto,
      ],
    },
    {
      id: 'datos',
      titulo: 'Qué datos pedimos y para qué',
      parrafos: ['Cuando pedís un turno te pedimos:'],
      lista: [
        'Nombre y teléfono, para poder avisarte y coordinar con vos.',
        'Email (opcional), para mandarte un recordatorio si ese aviso está activado.',
        'Tipo de vehículo y, si querés, el modelo, para preparar el trabajo.',
        'Servicio, fecha preferida y franja (mañana o tarde), para agendar.',
        'Un comentario (opcional), por si hay algo que tengamos que saber.',
      ],
      cierre: [
        'Usamos estos datos solo para gestionar tu turno: confirmarlo, reprogramarlo, escribirte y atenderte. No los usamos para publicidad ni los vendemos.',
        'Si solo mirás la web, no te pedimos nada. No usamos herramientas de análisis ni de publicidad.',
      ],
    },
    {
      id: 'seguimiento',
      titulo: 'El enlace para seguir tu turno',
      parrafos: [
        'Al pedir un turno te damos un enlace con un código largo. Quien tenga ese enlace puede ver el servicio, el día, la franja y el estado del turno. Nunca muestra tu nombre, teléfono, email, vehículo ni comentario. Cuidalo como cuidarías un comprobante.',
      ],
    },
    {
      id: 'terceros',
      titulo: 'Con quién se comparten',
      parrafos: ['No vendemos ni cedemos tus datos. Para que la web funcione usamos estos servicios:'],
      lista: terceros,
      cierre: [
        'El taller puede activar avisos y recordatorios; hoy están apagados hasta que se configuren. Si se activan, intervienen estos proveedores y reciben solo lo necesario:',
        'Aviso al taller por WhatsApp o Telegram cuando entra un turno nuevo: viajan el nombre, el teléfono, el vehículo y el comentario del pedido.',
        'Recordatorio al cliente el día anterior, por email (Resend) o por WhatsApp (Meta): viajan el servicio, el día, la franja y tu email o teléfono.',
        'Avisos al celular del equipo: dicen solo el servicio, el día y la franja.',
      ],
    },
    {
      id: 'conservacion',
      titulo: 'Cuánto tiempo los guardamos',
      parrafos: [
        'Los guardamos mientras sean necesarios para atender el servicio y llevar el historial del taller. El sistema no los borra solo en un plazo fijo.',
        'Si querés que borremos los tuyos antes, pedínoslo: más abajo te contamos cómo.',
      ],
    },
    {
      id: 'derechos',
      titulo: 'Tus derechos',
      parrafos: [
        'La Ley 25.326 de Protección de Datos Personales te da derecho a saber qué datos tuyos tenemos (acceso), a corregirlos si están mal (rectificación) y a pedir que los eliminemos (supresión).',
        'Para ejercerlos escribinos por los medios de contacto de arriba.',
        'La Agencia de Acceso a la Información Pública (AAIP) es el órgano de control de la ley. Podés presentarle un reclamo si sentís que no la cumplimos.',
      ],
    },
    {
      id: 'cookies',
      titulo: 'Cookies y almacenamiento en tu dispositivo',
      parrafos: [
        'Para quien visita la web, no usamos cookies. Solo guardamos en tu navegador, en el almacenamiento local, tu elección de tema (claro u oscuro) para recordarla la próxima vez. No lleva datos personales y podés borrarla desde la configuración de tu navegador.',
        'El panel interno, al que entra solamente el equipo del taller, usa cookies de sesión para mantener el ingreso y guarda en el navegador unas preferencias propias (por ejemplo, la última visita y si los avisos están activados). Los clientes no lo usan.',
      ],
    },
    {
      id: 'cambios',
      titulo: 'Cambios en esta política',
      parrafos: ['Si cambiamos algo, actualizamos esta página y la fecha de arriba.'],
    },
  ];
}
