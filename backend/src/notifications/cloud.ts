import { type BookingNotifier, NotifyError } from '../domain/notifier.js';
import { formatBookingMessage } from './message.js';
import type { NotifierOptions } from './index.js';

const GRAPH_VERSION = 'v23.0';

export interface CloudSettings {
  token: string;
  phoneNumberId: string;
  template: string;
  language: string;
  ownerPhone: string;
}

/**
 * WhatsApp Cloud API (Meta). Manda una plantilla aprobada con UNA variable en el cuerpo ({{1}}) que lleva el
 * resumen del turno. Meta no admite saltos de línea en las variables, por eso van separados con " | ".
 */
export function createCloudNotifier(
  settings: CloudSettings,
  { fetch, publicUrl, timeoutMs }: NotifierOptions,
): BookingNotifier {
  return {
    async notifyNewBooking(booking, servicioNombre) {
      const summary = formatBookingMessage(booking, servicioNombre, publicUrl).replace(/\n/g, ' | ');
      const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${settings.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: settings.ownerPhone,
          type: 'template',
          template: {
            name: settings.template,
            language: { code: settings.language },
            components: [{ type: 'body', parameters: [{ type: 'text', text: summary }] }],
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new NotifyError(response.status);
    },
  };
}
