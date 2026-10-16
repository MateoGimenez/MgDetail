/**
 * Logger mínimo. Escribe una línea por evento: "<ISO> <NIVEL> <mensaje>".
 *
 * Regla del proyecto: NO se loguean bodies, datos personales, cookies ni headers.
 * Los mensajes se sanitizan para que un valor con saltos de línea no pueda falsificar líneas de log.
 */

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

type Sink = (line: string) => void;

/** Reemplaza caracteres de control (incluye CR/LF) por un espacio. */
function sanitizeLogText(text: string): string {
  return text.replace(/\p{Cc}+/gu, ' ');
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    // Se loguea el stack (rutas de archivos + mensaje del error), nunca datos del request.
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return typeof error === 'string' ? error : 'Error no identificado';
}

export function createLogger(sinks: { out?: Sink; err?: Sink; now?: () => Date } = {}): Logger {
  const out: Sink = sinks.out ?? ((line) => process.stdout.write(`${line}\n`));
  const err: Sink = sinks.err ?? ((line) => process.stderr.write(`${line}\n`));
  const now = sinks.now ?? (() => new Date());

  const format = (level: string, message: string): string =>
    `${now().toISOString()} ${level} ${sanitizeLogText(message)}`;

  return {
    info: (message) => {
      out(format('INFO ', message));
    },
    warn: (message) => {
      err(format('WARN ', message));
    },
    error: (message, error) => {
      const base = format('ERROR', message);
      err(error === undefined ? base : `${base}\n${describeError(error)}`);
    },
  };
}
