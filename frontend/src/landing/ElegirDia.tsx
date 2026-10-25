import { useState } from 'react';
import { ETIQUETA_FRANJA, FRANJAS, type Franja } from '../api/contract';
import { SubrayadoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { MOTIVO_NO_DISPONIBLE, estadoDelDia, franjaLibre, mesesDelCalendario } from '../lib/disponibilidad';
import { diaConMes, numeroDelDia } from '../lib/fechas';
import { ErrorDeCampo } from './CampoTexto';
import type { DiasDisponibles } from './useDisponibilidad';

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

const INICIALES = [
  ['L', 'lunes'],
  ['M', 'martes'],
  ['M', 'miércoles'],
  ['J', 'jueves'],
  ['V', 'viernes'],
  ['S', 'sábado'],
  ['D', 'domingo'],
] as const;

interface Aria {
  name: string;
  'aria-invalid': boolean | undefined;
  'aria-describedby': string | undefined;
}

interface PropsDia {
  dias: DiasDisponibles;
  hoy: string;
  valor: string;
  /** id del fieldset (destino del foco si no hay ningún día para enfocar). */
  idCampo: string;
  idError: string;
  error: string | undefined;
  /** name y aria del radio, con el error ya enlazado (useFormularioTurno). */
  aria: Aria;
  alElegir: (fecha: string) => void;
}

/**
 * Calendario de los próximos 60 días, de a un mes. Cada día es un radio nativo: las flechas recorren solo los días
 * con lugar (los cerrados y llenos están deshabilitados y dicen por qué). El mes se cambia con sus dos botones.
 */
export function ElegirDia({ dias, hoy, valor, idCampo, idError, error, aria, alElegir }: PropsDia) {
  const meses = mesesDelCalendario([...dias.keys()]);
  const inicial = () => {
    const delValor = meses.findIndex((m) => valor.startsWith(m.clave));
    if (delValor >= 0) return delValor;
    const conLugar = meses.findIndex((m) => m.semanas.flat().some((f) => f !== null && estadoDelDia(dias.get(f)) === 'libre'));
    return Math.max(conLugar, 0);
  };
  const [indice, setIndice] = useState(inicial);
  const actual = meses[Math.min(indice, meses.length - 1)];
  if (!actual) return null;
  const titulo = `${MESES[actual.mes - 1] ?? ''} ${String(actual.anio)}`;
  const describe = [`${idCampo}-leyenda`, aria['aria-describedby']].filter(Boolean).join(' ');

  return (
    <fieldset id={idCampo} tabIndex={-1} className="campo calendario" aria-describedby={error ? idError : undefined}>
      <legend className="campo__etiqueta">Día</legend>
      <div className="calendario__cabeza">
        <button
          type="button"
          className="calendario__flecha"
          aria-label="Mes anterior"
          disabled={indice === 0}
          onClick={() => {
            setIndice((i) => Math.max(i - 1, 0));
          }}
        >
          <Icono nombre="izquierda" tamano={20} />
        </button>
        <p className="calendario__mes" aria-live="polite">
          {titulo}
        </p>
        <button
          type="button"
          className="calendario__flecha"
          aria-label="Mes siguiente"
          disabled={indice >= meses.length - 1}
          onClick={() => {
            setIndice((i) => Math.min(i + 1, meses.length - 1));
          }}
        >
          <Icono nombre="derecha" tamano={20} />
        </button>
      </div>

      <div className="calendario__semana" aria-hidden="true">
        {INICIALES.map(([letra, nombre]) => (
          <abbr key={nombre} title={nombre}>
            {letra}
          </abbr>
        ))}
      </div>

      <div className="calendario__dias">
        {actual.semanas.flat().map((fecha, i) => {
          if (fecha === null) return <span key={`vacio-${String(i)}`} className="calendario__vacio" aria-hidden="true" />;
          const estado = estadoDelDia(dias.get(fecha));
          const elegido = valor === fecha;
          const esHoy = fecha === hoy;
          return (
            <label
              key={fecha}
              className={['calendario__dia', `calendario__dia--${estado}`, esHoy ? 'calendario__dia--hoy' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <input
                className="calendario__input"
                type="radio"
                value={fecha}
                checked={elegido}
                disabled={estado !== 'libre'}
                onChange={() => {
                  alElegir(fecha);
                }}
                {...aria}
                aria-describedby={describe}
              />
              <span className="calendario__numero" aria-hidden="true">
                {numeroDelDia(fecha)}
              </span>
              <span className="calendario__nota" aria-hidden="true">
                {estado === 'lleno' ? 'lleno' : esHoy ? 'hoy' : ''}
              </span>
              <span className="visualmente-oculto">
                {diaConMes(fecha)}
                {esHoy ? ', hoy' : ''}
                {estado !== 'libre' ? `: ${MOTIVO_NO_DISPONIBLE[estado]}` : ''}
              </span>
              {elegido && <SubrayadoFilete className="calendario__trazo" />}
            </label>
          );
        })}
      </div>

      <p id={`${idCampo}-leyenda`} className="campo__ayuda calendario__leyenda">
        <span className="calendario__muestra calendario__muestra--cerrado" aria-hidden="true">
          8
        </span>
        No atendemos
        <span className="calendario__muestra calendario__muestra--lleno" aria-hidden="true">
          8
        </span>
        Sin lugar
      </p>
      <ErrorDeCampo id={idError} mensaje={error} />
    </fieldset>
  );
}

interface PropsFranja {
  dias: DiasDisponibles;
  fecha: string;
  valor: string;
  idCampo: string;
  idError: string;
  error: string | undefined;
  aria: Aria;
  alElegir: (franja: Franja) => void;
}

/** Mañana o tarde del día elegido: solo se puede marcar la que tiene lugar; la otra dice "sin lugar". */
export function ElegirFranja({ dias, fecha, valor, idCampo, idError, error, aria, alElegir }: PropsFranja) {
  const dia = fecha ? dias.get(fecha) : undefined;
  return (
    <fieldset id={idCampo} tabIndex={-1} className="campo selector-franja" aria-describedby={error ? idError : undefined}>
      <legend className="campo__etiqueta">Horario</legend>
      {dia ? (
        <div className="selector selector--2">
          {FRANJAS.map((franja) => {
            const libre = franjaLibre(dia, franja);
            return (
              <label key={franja} className="selector__opcion">
                <input
                  className="selector__input"
                  type="radio"
                  value={franja}
                  checked={valor === franja}
                  disabled={!libre}
                  onChange={() => {
                    alElegir(franja);
                  }}
                  {...aria}
                />
                <span className="selector__texto">
                  {ETIQUETA_FRANJA[franja]}
                  {!libre && <span className="selector__sin-lugar"> · sin lugar</span>}
                </span>
                <SubrayadoFilete className="selector__trazo" />
              </label>
            );
          })}
        </div>
      ) : (
        <p className="campo__ayuda franja__espera">Elegí un día y te mostramos los horarios con lugar.</p>
      )}
      <ErrorDeCampo id={idError} mensaje={error} />
    </fieldset>
  );
}

/** Mientras llega la disponibilidad: el lugar del calendario, sin saltos. */
export function CalendarioCargando() {
  return (
    <div className="campo calendario calendario--cargando">
      <p className="campo__etiqueta">Día</p>
      <p className="campo__ayuda" role="status">
        Buscando los días con lugar…
      </p>
      <div className="calendario__esqueleto" aria-hidden="true" />
    </div>
  );
}
