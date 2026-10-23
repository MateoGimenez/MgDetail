import { useEffect, useState, type ReactNode } from 'react';
import { esAbortado } from '../api/client';
import { listarServiciosPublicos } from '../api/servicios';
import { CATALOGO_CARGANDO, CATALOGO_RESPALDO, CatalogoContexto, catalogoDeLaApi, type Catalogo } from './catalogo-contexto';

/** Pide el catálogo una vez al abrir la landing. Mientras tanto, y si falla, la web muestra el respaldo. */
export function CatalogoProvider({ children }: { children: ReactNode }) {
  const [catalogo, setCatalogo] = useState<Catalogo>(CATALOGO_CARGANDO);

  useEffect(() => {
    const control = new AbortController();
    listarServiciosPublicos(control.signal)
      .then((servicios) => {
        setCatalogo(catalogoDeLaApi(servicios));
      })
      .catch((error: unknown) => {
        if (esAbortado(error)) return;
        setCatalogo(CATALOGO_RESPALDO);
      });
    return () => {
      control.abort();
    };
  }, []);

  return <CatalogoContexto value={catalogo}>{children}</CatalogoContexto>;
}
