import type { WhatsappConfig } from '../config.js';
import type { BookingNotifier } from '../domain/notifier.js';
import { createCallMeBotNotifier } from './callmebot.js';
import { createCloudNotifier } from './cloud.js';
import { createTelegramNotifier } from './telegram.js';

export type FetchFn = typeof fetch;

export interface NotifierOptions {
  fetch: FetchFn;
  /** Origen público del sitio (sin barra final), para el link al panel. */
  publicUrl: string | undefined;
  timeoutMs: number;
}

export const NOTIFY_TIMEOUT_MS = 5000;

/** Elige el notificador según la config. undefined = avisos desactivados. */
export function createNotifier(
  whatsapp: WhatsappConfig,
  publicUrl: string | undefined,
  fetchFn: FetchFn = fetch,
  timeoutMs: number = NOTIFY_TIMEOUT_MS,
): BookingNotifier | undefined {
  const options: NotifierOptions = { fetch: fetchFn, publicUrl, timeoutMs };
  switch (whatsapp.provider) {
    case 'callmebot':
      return createCallMeBotNotifier(whatsapp, options);
    case 'cloud':
      return createCloudNotifier(whatsapp, options);
    case 'telegram':
      return createTelegramNotifier(whatsapp, options);
    case 'none':
      return undefined;
  }
}
