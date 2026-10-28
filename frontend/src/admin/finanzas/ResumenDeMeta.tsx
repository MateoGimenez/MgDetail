import { Icono, type NombreIcono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import {
  TEXTO_ESTADO_META,
  fraseDias,
  fraseFaltante,
  fraseProyeccion,
  fraseTrabajos,
  type EstadoMeta,
} from '../../lib/finanzas';
import type { MetaActual } from '../../api/finanzas';
import { BarraDeMeta } from './BarraDeMeta';

const ICONO_ESTADO: Readonly<Record<EstadoMeta, NombreIcono>> = {
  'sin-meta': 'menos',
  cumplida: 'check',
  adelantado: 'arriba',
  'en-ritmo': 'derecha',
  atrasado: 'alerta',
};

/** El estado de la meta como sello: ícono y palabras (nunca solo color). */
export function EstadoDeMeta({ estado }: { estado: EstadoMeta }) {
  return (
    <span className={`meta-estado meta-estado--${estado}`}>
      <Icono nombre={ICONO_ESTADO[estado]} tamano={16} />
      {TEXTO_ESTADO_META[estado].titulo}
    </span>
  );
}

interface Props {
  actual: MetaActual;
  /** Compacto (Hoy y Estadísticas): barras, estado y lo que falta. Completo (Finanzas): suma proyección y días. */
  completo?: boolean;
}

/** Las barras de la meta del mes (ingresos y/o trabajos) con su estado, lo que falta y, completo, la proyección. */
export function ResumenDeMeta({ actual, completo = false }: Props) {
  const { meta, progreso: p } = actual;
  if (!meta) return <p className="meta-vacia">{TEXTO_ESTADO_META['sin-meta'].detalle}</p>;

  const cumplida = p.estado === 'cumplida';
  const faltante = fraseFaltante(meta, p);
  const proyeccion = completo ? fraseProyeccion(p) : null;

  return (
    <div className="meta-resumen">
      <p className="meta-resumen__estado">
        <EstadoDeMeta estado={p.estado} />
        <span className="meta-resumen__detalle">{TEXTO_ESTADO_META[p.estado].detalle}</span>
      </p>

      <div className="meta-resumen__barras">
        {meta.ingresosObjetivo !== null && (
          <BarraDeMeta
            nombre="Ingresos"
            lectura={`${formatoPesos(p.ingresos)} de ${formatoPesos(meta.ingresosObjetivo)}`}
            proporcion={p.porcentajeIngresos}
            cumplida={cumplida || p.ingresos >= meta.ingresosObjetivo}
          />
        )}
        {meta.trabajosObjetivo !== null && (
          <BarraDeMeta
            nombre="Trabajos"
            lectura={fraseTrabajos(p.trabajos, meta.trabajosObjetivo)}
            proporcion={p.porcentajeTrabajos}
            cumplida={p.trabajos >= meta.trabajosObjetivo}
          />
        )}
      </div>

      {faltante && <p className="meta-resumen__frase meta-resumen__frase--fuerte">{faltante}</p>}
      {completo && (
        <>
          {proyeccion && <p className="meta-resumen__frase">{proyeccion}</p>}
          <p className="meta-resumen__frase meta-resumen__frase--suave">{fraseDias(p)}</p>
        </>
      )}
    </div>
  );
}
