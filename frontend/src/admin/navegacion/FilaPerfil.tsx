import type { ReactNode } from 'react';
import { Icono } from '../../components/Icono';

/** Contenido de una fila del menú de perfil (ícono, título, una línea de detalle y la flecha). */
export function FilaPerfil({ icono, titulo, detalle }: { icono: ReactNode; titulo: string; detalle: string }) {
  return (
    <>
      <span className="perfil__fila-icono" aria-hidden="true">
        {icono}
      </span>
      <span className="perfil__fila-texto">
        <span className="perfil__fila-titulo">{titulo}</span>
        <span className="perfil__fila-detalle">{detalle}</span>
      </span>
      <Icono nombre="derecha" tamano={18} className="perfil__fila-flecha" aria-hidden="true" />
    </>
  );
}
