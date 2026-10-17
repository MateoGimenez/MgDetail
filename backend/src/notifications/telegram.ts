import { type BookingNotifier, NotifyError } from '../domain/notifier.js';
import { formatBookingMessage } from './message.js';
import type { NotifierOptions } from './index.js';

/**
 * Bot de Telegram (API oficial, gratuita): sendMessage al chat del dueño, en texto plano.
 * El token va en la URL: NUNCA se loguea.
 */
export function createTelegramNotifier(
  settings: { botToken: string; chatId: string },
  { fetch, publicUrl, timeoutMs }: NotifierOptions,
): BookingNotifier {
  return {
    async notifyNewBooking(booking) {
      const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.chatId,
          text: formatBookingMessage(booking, publicUrl),
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new NotifyError(response.status);
    },
  };
}
