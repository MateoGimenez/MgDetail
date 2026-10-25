import { SubrayadoFilete } from '../components/Filete';
import { elegirTema } from './tema';
import { useTema } from './useTema';

/**
 * Botón de tema: "Modo claro", con aria-pressed (presionado = se ve claro).
 * El nombre no cambia con el estado; el lector de pantalla anuncia
 * "Modo claro, presionado / no presionado". Como en los selectores, lo elegido
 * se marca con borde rojo y un filete corto que se dibuja de un trazo.
 *
 * - `cabecera`: botón cuadrado con el sol, al lado del menú.
 * - `menu`: renglón del menú del celular, con el texto y una llave.
 */

const NOMBRE = 'Modo claro';

function Sol() {
  return (
    <svg
      className="boton-tema__sol"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="boton-tema__nucleo" cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M5.5 18.5 7 17M17 7l1.5-1.5" />
    </svg>
  );
}

export function BotonTema({ variante }: { variante: 'cabecera' | 'menu' }) {
  const tema = useTema();
  const claro = tema === 'claro';
  const alternar = () => {
    elegirTema(claro ? 'oscuro' : 'claro');
  };

  if (variante === 'menu') {
    return (
      <button type="button" className="tema-renglon" aria-pressed={claro} onClick={alternar}>
        {NOMBRE}
        <span className="tema-renglon__llave" aria-hidden="true">
          <span className="tema-renglon__perilla" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={claro ? 'boton-tema seleccionado' : 'boton-tema'}
      aria-pressed={claro}
      aria-label={NOMBRE}
      title={NOMBRE}
      onClick={alternar}
    >
      <Sol />
      <SubrayadoFilete className="boton-tema__trazo" />
    </button>
  );
}
