import type { Comparacion, Estadisticas } from '../../api/estadisticas';
import { Icono } from '../../components/Icono';
import { pesos, textoVariacion, trabajos, variacion, type Variacion } from '../../lib/estadisticas';
import { pesosConSigno } from '../../lib/finanzas';

interface Tarjeta {
  clave: keyof Estadisticas['resumen'];
  titulo: string;
  /** Con qué se compara, tal como se dice en voz alta ("ayer"). */
  contra: string;
}

const TARJETAS: readonly Tarjeta[] = [
  { clave: 'hoy', titulo: 'Hoy', contra: 'ayer' },
  { clave: 'mes', titulo: 'Este mes', contra: 'el mes pasado' },
  { clave: 'anio', titulo: 'Este año', contra: 'el año pasado' },
];

function Cambio({ nombre, v, contra }: { nombre: string; v: Variacion; contra: string }) {
  return (
    <li className={`est-cambio est-cambio--${v.tipo}`}>
      <span className="est-cambio__que">{nombre}</span>
      <span className="est-cambio__texto">
        {v.tipo === 'sube' && <Icono nombre="arriba" tamano={16} />}
        {v.tipo === 'baja' && <Icono nombre="abajo" tamano={16} />}
        <span aria-hidden={v.tipo === 'sin-base' ? true : undefined}>{textoVariacion(v, contra)}</span>
        {v.tipo === 'sin-base' && <span className="visualmente-oculto">Sin datos de {contra} para comparar</span>}
      </span>
    </li>
  );
}

function TarjetaDePeriodo({ tarjeta, datos }: { tarjeta: Tarjeta; datos: Comparacion }) {
  const { actual, anterior } = datos;
  return (
    <article className="est-kpi">
      <h3 className="est-kpi__titulo">{tarjeta.titulo}</h3>
      <p className="est-kpi__valor">{pesos(actual.ingresos)}</p>
      <p className="est-kpi__sub">
        {trabajos(actual.completados)} {actual.completados === 1 ? 'completado' : 'completados'}
      </p>
      <dl className="est-kpi__neta">
        <div>
          <dt>Gastos</dt>
          <dd>{pesos(actual.gastos)}</dd>
        </div>
        <div>
          <dt>Ganancia neta</dt>
          <dd className={actual.ganancia < 0 ? 'est-kpi__neta-valor est-kpi__neta-valor--negativa' : 'est-kpi__neta-valor'}>
            {pesosConSigno(actual.ganancia)}
          </dd>
        </div>
      </dl>
      <ul className="est-kpi__cambios" role="list">
        <Cambio nombre="Ingresos" v={variacion(actual.ingresos, anterior.ingresos)} contra={tarjeta.contra} />
        <Cambio nombre="Ganancia" v={variacion(actual.ganancia, anterior.ganancia)} contra={tarjeta.contra} />
        <Cambio nombre="Trabajos" v={variacion(actual.completados, anterior.completados)} contra={tarjeta.contra} />
      </ul>
    </article>
  );
}

/**
 * Hoy, este mes y este año: siempre con la fecha de hoy, sin importar el período elegido abajo. Cada uno se compara
 * con el período anterior equivalente (los mismos días), y sin base de comparación dice "—".
 */
export function TarjetasDePeriodo({ resumen }: { resumen: Estadisticas['resumen'] }) {
  return (
    <section aria-labelledby="est-tarjetas-titulo">
      <h2 id="est-tarjetas-titulo" className="visualmente-oculto">
        Hoy, este mes y este año
      </h2>
      <div className="est-kpis">
        {TARJETAS.map((t) => (
          <TarjetaDePeriodo key={t.clave} tarjeta={t} datos={resumen[t.clave]} />
        ))}
      </div>
      <p className="est-kpis__nota">
        La ganancia neta es lo cobrado menos lo gastado. Se comparan con los mismos días del período anterior: hoy con ayer, este mes con el mes pasado hasta el mismo día y este año con el
        año pasado hasta el mismo día.
      </p>
    </section>
  );
}
