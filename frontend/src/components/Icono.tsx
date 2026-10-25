import type { ReactNode, SVGProps } from 'react';

/**
 * Íconos propios de MgDetailing: grilla de 24, trazo de 1,75 y puntas redondas.
 * Son decorativos (aria-hidden): el texto del botón o del enlace dice qué hacen.
 */

const TRAZOS = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  flecha: <path d="M5 12h14M13 6l6 6-6 6" />,
  abajo: <path d="m6 9 6 6 6-6" />,
  arriba: <path d="m6 15 6-6 6 6" />,
  izquierda: <path d="m15 6-6 6 6 6" />,
  derecha: <path d="m9 6 6 6-6 6" />,
  lapiz: <path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4ZM13 7l4 4" />,
  estrella: <path d="m12 4.2 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.6l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8Z" />,
  mas: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  buscar: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  historial: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9M12 8v4.2l3 1.8" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  copiar: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3" />
    </>
  ),
  cerrado: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m6.5 17.5 11-11" />
    </>
  ),
  ubicacion: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  reloj: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  telefono: (
    <path d="M5.2 4.5h3l1.5 4-2 1.3a10 10 0 0 0 6.5 6.5l1.3-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.7 6.1a1.5 1.5 0 0 1 1.5-1.6Z" />
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7.5 8 6 8-6" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  papelera: (
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
  ),
  salir: <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M14 8l4 4-4 4M18 12H9" />,
  refrescar: <path d="M19.5 10A7.5 7.5 0 0 0 6 6.3L4 8.5M4 4v4.5h4.5M4.5 14A7.5 7.5 0 0 0 18 17.7l2-2.2M20 20v-4.5h-4.5" />,
  ojo: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  ojoTachado: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </>
  ),
  alerta: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.3v.2" />
    </>
  ),
  externo: <path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />,
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.1" cy="6.9" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  whatsapp: (
    <>
      <path d="m4.2 19.8 1.1-3.6a8 8 0 1 1 3.1 2.6Z" />
      <path
        d="M9.1 7.9c.3-.4.7-.4 1-.2l.9 1.7c.2.3.1.7-.1 1l-.6.6c.5 1.2 1.5 2.2 2.7 2.7l.6-.6c.3-.2.7-.3 1-.1l1.7.9c.3.2.3.6-.1 1-.6.6-1.4 1-2.3.8-2.4-.6-4.6-2.8-5.2-5.2-.2-.9 0-1.9.4-2.6Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type NombreIcono = keyof typeof TRAZOS;

interface Props extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  nombre: NombreIcono;
  tamano?: number;
}

export function Icono({ nombre, tamano = 20, className, ...resto }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamano}
      height={tamano}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `icono ${className}` : 'icono'}
      {...resto}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
