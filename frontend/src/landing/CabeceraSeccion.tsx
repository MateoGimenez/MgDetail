import type { ReactNode } from 'react';
import { SubrayadoFilete } from '../components/Filete';
import { useRevelar } from './useRevelar';

/**
 * Encabezado de sección: título, filete de marca y la bajada que se pase de hijo. Al entrar en pantalla sube
 * suave y el filete se dibuja de un trazo (revelar.css).
 */
export function CabeceraSeccion({
  id,
  titulo,
  className,
  children,
}: {
  /** id del <h2>: la sección lo usa en aria-labelledby. */
  id: string;
  titulo: string;
  /** Clase de la sección (ej.: 'proceso__cabecera'), además de las comunes. */
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRevelar();
  return (
    <header ref={ref} className={`seccion__cabecera revelar${className ? ` ${className}` : ''}`}>
      <h2 id={id} className="seccion__titulo">
        {titulo}
      </h2>
      <SubrayadoFilete className="seccion__filete" />
      {children}
    </header>
  );
}
