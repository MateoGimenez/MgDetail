import type { ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * Enlace a una sección de la landing (`#servicios`). En la landing es un ancla común; en otra página (la de un servicio)
 * lleva a `/#servicios` sin recargar, y la landing se desplaza sola a la sección (useIrAlHash).
 */
export function EnlaceSeccion({
  hash,
  enPagina = false,
  className,
  onClick,
  'aria-current': ariaCurrent,
  children,
}: {
  /** Con "#": '#servicios'. */
  hash: string;
  enPagina?: boolean;
  className?: string;
  onClick?: () => void;
  'aria-current'?: 'location' | undefined;
  children: ReactNode;
}) {
  if (enPagina) {
    return (
      <Link className={className} to={`/${hash}`} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <a className={className} href={hash} onClick={onClick} aria-current={ariaCurrent}>
      {children}
    </a>
  );
}
