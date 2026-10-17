import { type BookingNotifier, NotifyError } from '../domain/notifier.js';
import { formatBookingMessage } from './message.js';
import type { NotifierOptions } from './index.js';

const ENDPOINT = 'https://api.callmebot.com/whatsapp.php';

/** Arma la URL de CallMeBot. Lleva la apikey: NUNCA se loguea. */
export function callMeBotUrl(phone: string, text: string, apikey: string): string {
  const enc = encodeURIComponent;
  return `${ENDPOINT}?phone=${enc(phone)}&text=${enc(text)}&apikey=${enc(apikey)}`;
}

/** CallMeBot: servicio gratuito de terceros (no oficial) para mandarse avisos a uno mismo por WhatsApp. */
export function createCallMeBotNotifier(
  settings: { ownerPhone: string; apikey: string },
  { fetch, publicUrl, timeoutMs }: NotifierOptions,
): BookingNotifier {
  return {
    async notifyNewBooking(booking) {
      const url = callMeBotUrl(settings.ownerPhone, formatBookingMessage(booking, publicUrl), settings.apikey);
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new NotifyError(response.status);
    },
  };
}
