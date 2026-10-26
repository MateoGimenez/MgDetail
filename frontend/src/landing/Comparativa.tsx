import { useId, useState, type CSSProperties } from 'react';
import { Icono } from '../components/Icono';
import { textoPrecio } from '../data/servicios';
import {
  armarFilas,
  diferencia,
  dividirFilas,
  elegirEnPar,
  resolverPar,
  type Diferencia,
  type Fila,
  type Par,
} from '../lib/comparativa';
import type { Servicio } from '../types';
import { useCatalogo } from './catalogo-contexto';
import { useReserva } from './reserva-contexto';
import { revelar } from './useRevelar';

const PESOS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

/** Hasta qué fila se escalona la aparición de los ✓: con tablas largas el último no tarda de más. */
const MAX_ESCALONADO = 8;
/** Filas de datos (precio y duración) que van antes de las de "incluye". */
const FILAS_DE_DATOS = 2;

const cosas = (n: number) => `${String(n)} ${n === 1 ? 'cosa' : 'cosas'}`;
const retraso = (i: number) => ({ '--i': Math.min(i, MAX_ESCALONADO) }) as CSSProperties;

/** ✓ / — con texto para lectores de pantalla: la diferencia no depende del color. */
function Marca({ incluido, extra, i }: { incluido: boolean; extra: boolean; i?: number }) {
  if (!incluido) {
    return (
      <span className="marca marca--no">
        <span aria-hidden="true">—</span>
        <span className="visualmente-oculto">No incluido</span>
      </span>
    );
  }
  const clase = `marca marca--si${extra ? ' marca--extra' : ''}${i === undefined ? '' : ' revelar-marca'}`;
  return (
    <span className={clase} style={i === undefined ? undefined : retraso(i)}>
      <Icono nombre="check" tamano={22} strokeWidth={2.4} />
      <span className="visualmente-oculto">Incluido</span>
    </span>
  );
}

/** "Por $ 20.000 más, el Lavado Premium suma 4 cosas." o, sin los dos precios, "Sumás 4 cosas…". */
function Resumen({ dif, nombre }: { dif: Diferencia | null; nombre: string | null }) {
  if (!dif || nombre === null) {
    return <p className="comparativa__frase">Estos dos servicios incluyen lo mismo. Elegí el que tenga la duración que te quede mejor.</p>;
  }
  return (
    <p className="comparativa__frase">
      {dif.pesos !== null ? (
        <>
          <strong className="comparativa__monto">Por {PESOS.format(dif.pesos)} más</strong>, el {nombre} suma{' '}
          {cosas(dif.extras.length)}.
        </>
      ) : (
        <>
          <strong className="comparativa__monto">Sumás {cosas(dif.extras.length)}</strong> con el {nombre}. Consultá el
          precio de cada uno.
        </>
      )}
    </p>
  );
}

function Selector({
  etiqueta,
  valor,
  servicios,
  alElegir,
}: {
  etiqueta: string;
  valor: string;
  servicios: readonly Servicio[];
  alElegir: (id: string) => void;
}) {
  const id = useId();
  return (
    <div className="campo comparativa__selector">
      <label className="campo__etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <select
        id={id}
        className="entrada"
        value={valor}
        onChange={(evento) => {
          alElegir(evento.target.value);
        }}
      >
        {servicios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * "¿Cuál te conviene?": dos servicios lado a lado, qué suma uno respecto del otro y, solo si los dos precios están
 * cargados, cuánto más cuesta. La tabla muestra lo que los distingue; lo que incluyen los dos va en una fila
 * desplegable. No se muestra con menos de dos servicios ni sin un servicio destacado.
 */
export function Comparativa() {
  const { servicios, estado } = useCatalogo();
  const { reservar } = useReserva();
  const [elegido, setElegido] = useState<Par | null>(null);
  const [verComunes, setVerComunes] = useState(false);
  const comunesId = useId();
  const par = resolverPar(servicios, elegido);
  const a = par && servicios.find((s) => s.id === par.a);
  const b = par && servicios.find((s) => s.id === par.b);
  if (!par || !a || !b) return null;

  const filas = armarFilas(a, b, servicios);
  const { comunes, distintas } = dividirFilas(filas);
  const dif = diferencia(a, b, filas);
  const nombreQueSuma = dif ? (dif.mas === a.id ? a.nombre : b.nombre) : null;
  const soloUno = (fila: Fila, lado: 'a' | 'b') => (lado === 'a' ? fila.enA && !fila.enB : fila.enB && !fila.enA);
  const cargando = estado === 'cargando';

  const precio = (s: Servicio) =>
    cargando ? (
      <span className="tarjeta__precio-cargando">
        <span className="visualmente-oculto">Cargando precio</span>
      </span>
    ) : (
      textoPrecio(s.precioDesde)
    );

  return (
    <section ref={revelar} className="comparativa" aria-labelledby="comparativa-titulo">
      <div className="comparativa__cabeza">
        <h3 id="comparativa-titulo" className="comparativa__titulo">
          ¿Cuál te conviene?
        </h3>
        <p className="comparativa__bajada">Elegí dos servicios y mirá en qué se diferencian.</p>
      </div>

      <div className="comparativa__selectores">
        <Selector
          etiqueta="Comparar"
          valor={par.a}
          servicios={servicios}
          alElegir={(id) => {
            setElegido(elegirEnPar(par, 'a', id));
          }}
        />
        <Selector
          etiqueta="con"
          valor={par.b}
          servicios={servicios}
          alElegir={(id) => {
            setElegido(elegirEnPar(par, 'b', id));
          }}
        />
      </div>

      <div
        className="comparativa__resumen revelar-hijo"
        style={retraso(distintas.length + FILAS_DE_DATOS + 1)}
        aria-live="polite"
      >
        <Resumen dif={dif} nombre={nombreQueSuma} />
      </div>

      <div className="comparativa__tabla">
        <table className="tabla-comparativa">
          <caption className="visualmente-oculto">
            Comparación entre {a.nombre} y {b.nombre}: cuánto cuesta cada uno, cuánto tarda y qué suma uno respecto del
            otro.
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visualmente-oculto">Qué incluye</span>
              </th>
              <th scope="col">{a.nombre}</th>
              <th scope="col">{b.nombre}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="tabla-comparativa__dato">
              <th scope="row">Precio</th>
              <td>{precio(a)}</td>
              <td>{precio(b)}</td>
            </tr>
            <tr className="tabla-comparativa__dato">
              <th scope="row">Duración</th>
              <td>{a.duracion ?? 'A confirmar'}</td>
              <td>{b.duracion ?? 'A confirmar'}</td>
            </tr>
            {distintas.map((fila, i) => (
              <tr key={`${String(i)}-${fila.texto}`}>
                <th scope="row">{fila.texto}</th>
                <td>
                  <Marca incluido={fila.enA} extra={soloUno(fila, 'a')} i={i + FILAS_DE_DATOS} />
                </td>
                <td>
                  <Marca incluido={fila.enB} extra={soloUno(fila, 'b')} i={i + FILAS_DE_DATOS} />
                </td>
              </tr>
            ))}
            {comunes.length > 0 && (
              <tr className="tabla-comparativa__comunes">
                <td colSpan={3}>
                  <button
                    type="button"
                    className="tabla-comparativa__ver"
                    aria-expanded={verComunes}
                    aria-controls={comunesId}
                    onClick={() => {
                      setVerComunes((estaba) => !estaba);
                    }}
                  >
                    <span>
                      Incluyen los dos · {cosas(comunes.length)}
                    </span>
                    <Icono nombre="abajo" tamano={18} className="tabla-comparativa__chevron" />
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          {comunes.length > 0 && (
            <tbody id={comunesId} hidden={!verComunes}>
              {comunes.map((fila, i) => (
                <tr key={`${String(i)}-${fila.texto}`}>
                  <th scope="row">{fila.texto}</th>
                  <td>
                    <Marca incluido extra={false} />
                  </td>
                  <td>
                    <Marca incluido extra={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          )}
          <tfoot>
            <tr>
              <td />
              {[a, b].map((s) => (
                <td key={s.id}>
                  <button
                    type="button"
                    className={s.destacado ? 'boton boton--primario boton--chico' : 'boton boton--secundario boton--chico'}
                    onClick={() => {
                      reservar({ servicioId: s.id });
                    }}
                  >
                    Elegir {s.nombre}
                  </button>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
