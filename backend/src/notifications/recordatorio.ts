import type { RecordatoriosConfig } from '../config.js';
import { type CandidatoRecordatorio, type Franja, seguimientoPath } from '../domain/booking.js';
import { NotifyError } from '../domain/notifier.js';
import type { FetchFn } from './index.js';

const GRAPH_VERSION = 'v23.0';
const RESEND_URL = 'https://api.resend.com/emails';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
const FRANJAS: Readonly<Record<Franja, string>> = { manana: 'mañana', tarde: 'tarde' };

/** "2026-10-24" -> "sábado 24/10" (fecha de calendario, sin zona horaria). */
export function fechaLarga(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return isoDate;
  const weekday = DIAS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
  return `${weekday} ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/** Escape mínimo para HTML (el nombre del servicio lo escribe el dueño, pero igual se escapa). */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${String(char.codePointAt(0))};`);
}

/** Un canal de recordatorio: email o WhatsApp. `enviar` rechaza (NotifyError con el status) si no se pudo. */
export interface CanalRecordatorio {
  readonly nombre: 'email' | 'whatsapp';
  /** true si el turno tiene el dato que necesita este canal (email o teléfono normalizado). */
  aplica(turno: CandidatoRecordatorio): boolean;
  enviar(turno: CandidatoRecordatorio): Promise<void>;
}

export interface CanalOptions {
  fetch: FetchFn;
  /** Origen público del sitio (sin barra final), para el enlace de seguimiento. */
  publicUrl: string | undefined;
  timeoutMs: number;
}

/** Texto del recordatorio (email). Sin datos personales más allá de lo que el cliente ya sabe de su turno. */
export function textoRecordatorio(turno: CandidatoRecordatorio, publicUrl: string | undefined): string {
  const lines = [
    'Hola. Te recordamos tu turno de mañana en MgDetailing:',
    '',
    `Servicio: ${turno.servicioNombre}`,
    `Día: ${fechaLarga(turno.fecha)}`,
    `Franja: ${FRANJAS[turno.franja]}`,
  ];
  if (publicUrl !== undefined) lines.push('', `Seguí tu turno: ${publicUrl}${seguimientoPath(turno.id)}`);
  lines.push('', 'Si no podés venir, avisanos así le damos el lugar a otra persona. ¡Te esperamos!');
  return lines.join('\n');
}

/**
 * Email con Resend (POST https://api.resend.com/emails, fetch directo, sin SDK). La Idempotency-Key por turno y
 * fecha evita un email repetido si dos corridas se cruzan (Resend la recuerda 24 h).
 */
export function createEmailCanal(settings: NonNullable<RecordatoriosConfig['email']>, options: CanalOptions): CanalRecordatorio {
  return {
    nombre: 'email',
    aplica: (turno) => turno.email !== null,
    async enviar(turno) {
      if (turno.email === null) return;
      const text = textoRecordatorio(turno, options.publicUrl);
      const html = `<div style="font-family:sans-serif;line-height:1.5">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
      const response = await options.fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `recordatorio-${turno.id}-${turno.fecha}`,
        },
        body: JSON.stringify({
          from: settings.from,
          to: [turno.email],
          subject: 'Recordatorio: tu turno de mañana en MgDetailing',
          text,
          html,
        }),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (!response.ok) throw new NotifyError(response.status);
    },
  };
}

/**
 * WhatsApp Cloud API (Meta) con la plantilla de recordatorio aprobada. La plantilla lleva TRES variables en el
 * cuerpo: {{1}} servicio, {{2}} día ("sábado 24/10") y {{3}} franja ("mañana" o "tarde").
 */
export function createWhatsappCanal(
  settings: NonNullable<RecordatoriosConfig['whatsapp']>,
  options: CanalOptions,
): CanalRecordatorio {
  return {
    nombre: 'whatsapp',
    aplica: (turno) => turno.telefonoWhatsapp !== null,
    async enviar(turno) {
      if (turno.telefonoWhatsapp === null) return;
      // Meta no admite saltos de línea en las variables.
      const variable = (text: string) => ({ type: 'text', text: text.replace(/\s+/g, ' ').trim() });
      const response = await options.fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${settings.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: turno.telefonoWhatsapp,
          type: 'template',
          template: {
            name: settings.template,
            language: { code: settings.language },
            components: [
              {
                type: 'body',
                parameters: [
                  variable(turno.servicioNombre),
                  variable(fechaLarga(turno.fecha)),
                  variable(FRANJAS[turno.franja]),
                ],
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (!response.ok) throw new NotifyError(response.status);
    },
  };
}

/** Los canales configurados (puede ser ninguno). */
export function createCanalesRecordatorio(config: RecordatoriosConfig, options: CanalOptions): CanalRecordatorio[] {
  const canales: CanalRecordatorio[] = [];
  if (config.email !== undefined) canales.push(createEmailCanal(config.email, options));
  if (config.whatsapp !== undefined) canales.push(createWhatsappCanal(config.whatsapp, options));
  return canales;
}
