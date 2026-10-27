import { useId, type ReactNode } from 'react';
import type { TablaDatos } from '../../../lib/tablasEstadisticas';
import { TablaAlternativa } from './TablaAlternativa';

interface Props {
  titulo: string;
  /** Una línea que dice qué se está mirando y cómo se lee (queda visible). */
  ayuda: string;
  /** Texto que lee un lector de pantalla en lugar del dibujo: lo más importante que muestra el gráfico. */
  resumen: string;
  tabla: TablaDatos;
  children: (ids: { titulo: string; resumen: string }) => ReactNode;
  clase?: string;
}

/**
 * Tarjeta de un gráfico: título, ayuda, el dibujo y "Ver los números". El dibujo recibe los ids para nombrarse
 * (`aria-labelledby`) y describirse (`aria-describedby`); el resumen va oculto para la vista y visible para el lector.
 */
export function MarcoGrafico({ titulo, ayuda, resumen, tabla, children, clase }: Props) {
  const id = useId().replace(/:/g, '');
  const idTitulo = `${id}-titulo`;
  const idResumen = `${id}-resumen`;
  return (
    <section className={clase ? `est-tarjeta ${clase}` : 'est-tarjeta'} aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className="est-tarjeta__titulo">
        {titulo}
      </h2>
      <p className="est-tarjeta__ayuda">{ayuda}</p>
      <p id={idResumen} className="visualmente-oculto">
        {resumen}
      </p>
      {children({ titulo: idTitulo, resumen: idResumen })}
      <TablaAlternativa tabla={tabla} />
    </section>
  );
}
