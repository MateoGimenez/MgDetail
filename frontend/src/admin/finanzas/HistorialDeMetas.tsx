import type { FilaDeMeta } from '../../api/finanzas';
import { Icono, type NombreIcono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import {
  TEXTO_SITUACION,
  fraseTrabajos,
  nombreCortoDeMes,
  situacionDeMes,
  textoAvance,
  type SituacionDeMes,
} from '../../lib/finanzas';

const ICONO: Readonly<Record<SituacionDeMes, NombreIcono>> = {
  cumplida: 'check',
  'no-cumplida': 'cerrar',
  'en-curso': 'reloj',
  programada: 'calendario',
};

/** Cumplida / No se cumplió / En curso / Programada: ícono y palabras. */
export function SelloDeSituacion({ situacion }: { situacion: SituacionDeMes }) {
  return (
    <span className={`meta-situacion meta-situacion--${situacion}`}>
      <Icono nombre={ICONO[situacion]} tamano={16} />
      {TEXTO_SITUACION[situacion]}
    </span>
  );
}

interface Props {
  anio: number;
  filas: readonly FilaDeMeta[];
  hoy: string;
  cargando: boolean;
  error: string | null;
  alReintentar: () => void;
  alVerMes: (mes: string) => void;
  /** Año anterior / siguiente: mueven el mes que se mira doce meses. */
  alCambiarAnio: (delta: -1 | 1) => void;
}

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Las metas de un año, de la más nueva a la más vieja, con lo que se logró en cada mes y si se cumplió. */
export function HistorialDeMetas({ anio, filas, hoy, cargando, error, alReintentar, alVerMes, alCambiarAnio }: Props) {
  const ordenadas = [...filas].sort((a, b) => b.mes.localeCompare(a.mes));
  return (
    <section className="meta-historial" aria-labelledby="meta-historial-titulo" aria-busy={cargando}>
      <div className="meta-historial__cabeza">
        <h3 id="meta-historial-titulo" className="meta-historial__titulo">
          Metas de {String(anio)}
        </h3>
        <div className="meta-historial__anios">
          <button
            type="button"
            className="boton boton--secundario boton--chico"
            onClick={() => {
              alCambiarAnio(-1);
            }}
          >
            <Icono nombre="izquierda" tamano={18} />
            {String(anio - 1)}
          </button>
          <button
            type="button"
            className="boton boton--secundario boton--chico"
            onClick={() => {
              alCambiarAnio(1);
            }}
          >
            {String(anio + 1)}
            <Icono nombre="derecha" tamano={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="meta-del-mes__error" role="alert">
          <p>
            <Icono nombre="alerta" tamano={18} />
            No pudimos cargar las metas del año. {error}
          </p>
          <button type="button" className="boton boton--secundario boton--chico" onClick={alReintentar}>
            Reintentar
          </button>
        </div>
      )}

      {cargando && filas.length === 0 && !error && (
        <div className="meta-historial__esqueleto" aria-hidden="true">
          <span className="esq esq--completo" />
          <span className="esq esq--completo" />
        </div>
      )}

      {!cargando && !error && ordenadas.length === 0 && (
        <p className="meta-vacia">No hay metas fijadas en {String(anio)}. Cuando fijes una, queda guardada acá.</p>
      )}

      {ordenadas.length > 0 && (
        <ol className="meta-historial__lista" role="list">
          {ordenadas.map((fila) => {
            const situacion = situacionDeMes(fila.mes, fila.cumplida, hoy);
            return (
              <li key={fila.mes} className="meta-fila">
                <div className="meta-fila__cabeza">
                  <p className="meta-fila__mes">{conMayuscula(nombreCortoDeMes(fila.mes))}</p>
                  <SelloDeSituacion situacion={situacion} />
                </div>
                <ul className="meta-fila__datos" role="list">
                  {fila.ingresosObjetivo !== null && (
                    <li>
                      Ingresos: {formatoPesos(fila.ingresos)} de {formatoPesos(fila.ingresosObjetivo)} (
                      {textoAvance(fila.ingresos / fila.ingresosObjetivo)})
                    </li>
                  )}
                  {fila.trabajosObjetivo !== null && <li>Trabajos: {fraseTrabajos(fila.trabajos, fila.trabajosObjetivo)}</li>}
                </ul>
                <button
                  type="button"
                  className="boton boton--fantasma boton--chico meta-fila__ver"
                  onClick={() => {
                    alVerMes(fila.mes);
                  }}
                >
                  Ver el mes
                  <span className="visualmente-oculto"> de {nombreCortoDeMes(fila.mes)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
