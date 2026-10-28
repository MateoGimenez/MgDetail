import { useEffect, useId, useState } from 'react';
import { Icono } from '../components/Icono';
import type { NombreIcono } from '../components/Icono';
import type { Vista } from '../lib/hoy';
import { Hoja } from './navegacion/Hoja';
import type { Seccion } from './secciones';
import './navegacion.css';

interface Props {
  /** Las secciones que va a ver el rol, ya filtradas, en dos tandas (ver `navegacionPara`). */
  principales: readonly Seccion[];
  mas: readonly Seccion[];
  /** La sección que se está viendo. */
  vista: Vista;
  alElegir: (vista: Vista) => void;
  /** 'barra': abajo, con Más (celular y tablet). 'fila': todas en una fila bajo el encabezado (pantalla ancha). */
  modo: 'barra' | 'fila';
}

const ICONOS: Partial<Record<Vista, NombreIcono>> = {
  hoy: 'reloj',
  turnos: 'check',
  agenda: 'calendario',
};

/**
 * Navegación del panel, pensada primero para el celular.
 *
 * - Barra de abajo (hasta 1180 px): Hoy, Turnos, Agenda y "Más". Más abre una hoja con el resto de las secciones del
 *   rol. Siempre hay como máximo cuatro botones, así que nada se desplaza de costado ni hay que adivinar grupos.
 * - Pantalla ancha: las secciones del rol, todas en una fila bajo el encabezado.
 *
 * La sección actual lleva `aria-current="page"` y el filete rojo; si está dentro de Más, el botón Más lo marca.
 * La barra publica su alto en `--panel-barra` (en <html>) para que las barras fijas y los avisos la esquiven.
 */
export function NavegacionPanel({ principales, mas, vista, alElegir, modo }: Props) {
  const [masAbierto, setMasAbierto] = useState(false);
  const idTitulo = useId();

  useEffect(() => {
    if (modo !== 'barra') return;
    const raiz = document.documentElement;
    raiz.style.setProperty('--panel-barra', 'calc(64px + env(safe-area-inset-bottom, 0px))');
    return () => {
      raiz.style.removeProperty('--panel-barra');
    };
  }, [modo]);

  const elegir = (clave: Vista) => {
    setMasAbierto(false);
    if (clave !== vista) alElegir(clave);
  };

  if (modo === 'fila') {
    return (
      <nav className="panel__secciones" aria-label="Secciones del panel">
        <ul role="list" className="panel__fila">
          {[...principales, ...mas].map((s) => (
            <li key={s.clave}>
              <button
                type="button"
                className={vista === s.clave ? 'panel__seccion activa' : 'panel__seccion'}
                aria-current={vista === s.clave ? 'page' : undefined}
                onClick={() => {
                  elegir(s.clave);
                }}
              >
                {s.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  const actualEnMas = mas.find((s) => s.clave === vista);

  return (
    <>
      <nav className="barra-nav" aria-label="Secciones del panel">
        <ul role="list" className="barra-nav__lista">
          {principales.map((s) => (
            <li key={s.clave}>
              <button
                type="button"
                className="barra-nav__boton"
                data-activa={vista === s.clave ? 'true' : 'false'}
                aria-current={vista === s.clave ? 'page' : undefined}
                onClick={() => {
                  elegir(s.clave);
                }}
              >
                {ICONOS[s.clave] && <Icono nombre={ICONOS[s.clave] as NombreIcono} tamano={22} />}
                <span>{s.etiqueta}</span>
              </button>
            </li>
          ))}
          {mas.length > 0 && (
            <li>
              <button
                type="button"
                className="barra-nav__boton"
                data-activa={actualEnMas ? 'true' : 'false'}
                aria-haspopup="dialog"
                aria-expanded={masAbierto}
                onClick={() => {
                  setMasAbierto(true);
                }}
              >
                <Icono nombre="menu" tamano={22} />
                <span>Más</span>
                {actualEnMas && <span className="visualmente-oculto"> (sección actual: {actualEnMas.etiqueta})</span>}
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Hoja
        abierta={masAbierto}
        alCerrar={() => {
          setMasAbierto(false);
        }}
        idTitulo={idTitulo}
        titulo="Más secciones"
        variante="menu"
      >
        <ul role="list" className="hoja__lista">
          {mas.map((s) => (
            <li key={s.clave}>
              <button
                type="button"
                className="hoja__opcion"
                aria-current={vista === s.clave ? 'page' : undefined}
                onClick={() => {
                  elegir(s.clave);
                }}
              >
                {s.etiqueta}
                {vista === s.clave && <span className="hoja__aqui">Estás acá</span>}
              </button>
            </li>
          ))}
        </ul>
      </Hoja>
    </>
  );
}
