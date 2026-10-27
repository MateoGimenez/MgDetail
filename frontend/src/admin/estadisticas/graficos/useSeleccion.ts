import { useState, type KeyboardEvent } from 'react';

/**
 * Qué marca está elegida en un gráfico (tocándola, con el mouse o con las flechas). El dato de la elegida se
 * muestra en una línea fija debajo del gráfico: sirve igual en el celular, sin tooltip que se corte en el borde.
 * `columnas` > 1 hace que las flechas de arriba y abajo salten de fila (mapa de calor).
 */
export function useSeleccion(cantidad: number, columnas = cantidad) {
  const [elegida, setElegida] = useState<number | null>(null);
  // Si cambian los datos y la elegida ya no existe, no hay selección.
  const activa = elegida !== null && elegida < cantidad ? elegida : null;

  const alTeclear = (evento: KeyboardEvent) => {
    if (cantidad === 0) return;
    const desde = activa ?? -1;
    const horizontal = columnas === cantidad;
    let destino: number | null = null;
    switch (evento.key) {
      case 'ArrowRight':
        destino = Math.min(cantidad - 1, desde + 1);
        break;
      case 'ArrowLeft':
        destino = desde <= 0 ? 0 : desde - 1;
        break;
      case 'ArrowDown':
        destino = horizontal ? null : Math.min(cantidad - 1, desde < 0 ? 0 : desde + columnas);
        break;
      case 'ArrowUp':
        destino = horizontal ? null : Math.max(0, desde < 0 ? 0 : desde - columnas);
        break;
      case 'Home':
        destino = 0;
        break;
      case 'End':
        destino = cantidad - 1;
        break;
      case 'Escape':
        setElegida(null);
        return;
      default:
        return;
    }
    if (destino === null) return;
    evento.preventDefault();
    setElegida(destino);
  };

  return { activa, elegir: setElegida, alTeclear };
}
