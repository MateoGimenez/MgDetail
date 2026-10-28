import { useEffect } from 'react';
import { idDeHash } from '../lib/ancla';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

/**
 * La landing se monta recién con JavaScript: el navegador ya intentó ir al `#ancla` antes de que exista la sección
 * (por ejemplo `/?servicio=pulido#reservar`, o `/#preguntas` desde la página de un servicio). Acá se va a la sección
 * una vez dibujada. Sin ancla, una navegación nueva arranca arriba; al volver atrás se respeta la posición.
 */
export function useIrAlHash(): void {
  const { hash, key } = useLocation();
  const tipo = useNavigationType();
  useEffect(() => {
    const movimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const id = idDeHash(hash);
    if (id !== null) {
      // Dos cuadros: que el catálogo y las secciones ya estén medidos antes de calcular la posición.
      const cuadro = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: movimiento, block: 'start' });
        });
      });
      return () => {
        cancelAnimationFrame(cuadro);
      };
    }
    if (tipo !== NavigationType.Pop) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [hash, key, tipo]);
}
