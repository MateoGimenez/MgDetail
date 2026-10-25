import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Icono } from '../components/Icono';

type Copia = 'nada' | 'copiado' | 'manual';

/**
 * Enlace de seguimiento en la pantalla de éxito: la dirección completa a la vista, un botón para copiarla y el aviso
 * de que la guarde. Si el navegador no deja copiar (sin permiso o sin HTTPS), se selecciona el texto para copiarlo a mano.
 */
export function EnlaceSeguimiento({ ruta }: { ruta: string }) {
  const id = useId();
  const campoRef = useRef<HTMLInputElement>(null);
  const [copia, setCopia] = useState<Copia>('nada');
  const url = `${window.location.origin}${ruta}`;

  // El "Copiado" vuelve a "Copiar" después de un rato, para poder copiarlo de nuevo con la misma señal.
  useEffect(() => {
    if (copia !== 'copiado') return;
    const espera = window.setTimeout(() => {
      setCopia('nada');
    }, 4000);
    return () => {
      window.clearTimeout(espera);
    };
  }, [copia]);

  const seleccionar = () => {
    campoRef.current?.focus();
    campoRef.current?.select();
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopia('copiado');
    } catch {
      seleccionar();
      setCopia('manual');
    }
  };

  return (
    <div className="seguir" aria-labelledby={`${id}-titulo`} role="group">
      <p id={`${id}-titulo`} className="seguir__titulo">
        Seguí tu turno desde acá
      </p>
      <p id={`${id}-texto`} className="seguir__texto">
        Guardá este enlace: ahí vas a ver cuándo lo confirmamos, sin tener que llamar. Es solo tuyo y no muestra tus
        datos.
      </p>
      <div className="seguir__fila">
        <label className="visualmente-oculto" htmlFor={`${id}-url`}>
          Enlace de seguimiento de tu turno
        </label>
        <input
          ref={campoRef}
          id={`${id}-url`}
          className="entrada seguir__url"
          type="text"
          readOnly
          value={url}
          aria-describedby={`${id}-texto`}
          onFocus={(evento) => {
            evento.currentTarget.select();
          }}
        />
        <button
          type="button"
          className="boton boton--secundario seguir__copiar"
          onClick={() => {
            void copiar();
          }}
        >
          <Icono nombre={copia === 'copiado' ? 'check' : 'copiar'} tamano={18} />
          {copia === 'copiado' ? 'Copiado' : 'Copiar enlace'}
        </button>
      </div>
      <p className="seguir__estado" role="status">
        {copia === 'copiado'
          ? 'Listo, el enlace quedó copiado.'
          : copia === 'manual'
            ? 'No pudimos copiarlo solo: ya está seleccionado, copialo vos (mantené apretado o Ctrl + C).'
            : ''}
      </p>
      <Link className="enlace seguir__ver" to={ruta}>
        Ver cómo va mi turno
      </Link>
    </div>
  );
}
