import type { Booking, Franja } from '../domain/booking.js';

const MAX_COMMENT = 200;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const FRANJAS: Readonly<Record<Franja, string>> = { manana: 'Mañana', tarde: 'Tarde' };
const VEHICULOS = { auto: 'Auto', camioneta: 'Camioneta', moto: 'Moto' } as const;

/** "2026-10-20" -> "lun 20/10" (sin zona horaria: es una fecha de calendario). */
function fechaArgentina(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return isoDate;
  const weekday = DIAS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
  return `${weekday} ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/** Una sola línea y, como mucho, ~200 caracteres. */
function recortar(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_COMMENT ? `${flat.slice(0, MAX_COMMENT - 1).trimEnd()}…` : flat;
}

/**
 * Texto del aviso al dueño (corto, en español). `servicioNombre`: el nombre del catálogo (lo lee BookingService de la
 * base). `publicUrl` sin barra final; si no hay, no se incluye el panel.
 */
export function formatBookingMessage(booking: Booking, servicioNombre: string, publicUrl?: string): string {
  const vehiculo = [VEHICULOS[booking.vehiculoTipo], booking.vehiculoModelo].filter(Boolean).join(' ');
  const lines = [
    '🚗 Nuevo turno MgDetailing',
    `${recortar(servicioNombre)} · ${fechaArgentina(booking.fechaPreferida)} · ${FRANJAS[booking.franja]}`,
    `${recortar(booking.nombre)} · ${vehiculo}`,
    `Tel: ${recortar(booking.telefono)}`,
  ];
  if (booking.telefonoWhatsapp !== null) lines.push(`Escribile: https://wa.me/${booking.telefonoWhatsapp}`);
  if (booking.comentario) lines.push(`Comentario: ${recortar(booking.comentario)}`);
  if (publicUrl !== undefined) lines.push(`Panel: ${publicUrl}/admin`);
  return lines.join('\n');
}
