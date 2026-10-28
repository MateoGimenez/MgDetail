import { useEffect, useState } from 'react';

/**
 * Lo que se escribe pasa a la búsqueda después de una pausa breve (no un pedido por tecla). `aplicar` lo pasa ya,
 * para Enter y para Limpiar.
 */
export function useDemorado(valor: string, espera: number) {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    if (valor === demorado) return;
    const reloj = setTimeout(() => {
      setDemorado(valor);
    }, espera);
    return () => {
      clearTimeout(reloj);
    };
  }, [valor, demorado, espera]);
  return [demorado, setDemorado] as const;
}
