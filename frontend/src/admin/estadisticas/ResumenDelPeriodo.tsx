import type { PeriodoEstadisticas } from '../../api/estadisticas';
import { Icono } from '../../components/Icono';
import type { Vista } from '../../lib/hoy';
import { entero, pesos, porcentaje } from '../../lib/estadisticas';

const cifra = (n: number | null, formato: (valor: number) => string) => (n === null ? '—' : formato(n));

function Cifra({ nombre, valor, nota, grande }: { nombre: string; valor: string; nota?: string; grande?: boolean }) {
  return (
    <div className={grande ? 'est-cifra est-cifra--grande' : 'est-cifra'}>
      <dt className="est-cifra__nombre">{nombre}</dt>
      <dd className="est-cifra__valor">
        {valor === '—' ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="visualmente-oculto">Sin datos</span>
          </>
        ) : (
          valor
        )}
      </dd>
      {nota && <dd className="est-cifra__nota">{nota}</dd>}
    </div>
  );
}

/** Los números del período elegido: pedidos, completados, ingresos, ticket promedio y cancelación. */
export function ResumenDelPeriodo({ periodo }: { periodo: PeriodoEstadisticas }) {
  return (
    <section className="est-tarjeta" aria-labelledby="est-resumen-titulo">
      <h2 id="est-resumen-titulo" className="est-tarjeta__titulo">
        Resumen del período
      </h2>
      <dl className="est-cifras">
        <Cifra nombre="Ingresos" valor={pesos(periodo.ingresos)} grande />
        <Cifra nombre="Pedidos" valor={entero(periodo.pedidos)} nota="Sin los cancelados" />
        <Cifra nombre="Completados" valor={entero(periodo.completados)} />
        <Cifra
          nombre="Ticket promedio"
          valor={cifra(periodo.ticketPromedio, (n) => pesos(Math.round(n)))}
          nota="Por trabajo con cobro cargado"
        />
        <Cifra nombre="Cancelación" valor={cifra(periodo.tasaCancelacion, porcentaje)} nota="De todos los turnos" />
      </dl>
    </section>
  );
}

interface AvisosProps {
  periodo: PeriodoEstadisticas;
  completadosSinTrabajador: number;
  irA: (vista: Vista) => void;
}

const trabajosSin = (n: number, resto: string) => `${entero(n)} ${n === 1 ? 'trabajo' : 'trabajos'} ${resto}`;

/** Avisos de datos que faltan cargar: sin cobro y sin trabajador. Solo para quien ve importes (admin y superadmin). */
export function AvisosDeCarga({ periodo, completadosSinTrabajador, irA }: AvisosProps) {
  const sinMonto = periodo.completadosSinMonto;
  if (sinMonto <= 0 && completadosSinTrabajador <= 0) return null;
  return (
    <ul className="est-avisos" role="list">
      {sinMonto > 0 && (
        <li className="est-aviso">
          <Icono nombre="alerta" tamano={20} />
          <div>
            <p className="est-aviso__titulo">{trabajosSin(sinMonto, 'sin cobro cargado')}</p>
            <p className="est-aviso__texto">
              No suman a los ingresos todavía. Para completarlos, abrí el turno en Turnos y tocá “Cargar cobro” en su tarjeta.
            </p>
            <button
              type="button"
              className="boton boton--secundario boton--chico"
              onClick={() => {
                irA('turnos');
              }}
            >
              Ir a Turnos
            </button>
          </div>
        </li>
      )}
      {completadosSinTrabajador > 0 && (
        <li className="est-aviso">
          <Icono nombre="alerta" tamano={20} />
          <div>
            <p className="est-aviso__titulo">{trabajosSin(completadosSinTrabajador, 'sin trabajador asignado')}</p>
            <p className="est-aviso__texto">Aparecen como “Sin asignar” en el ranking del equipo. Podés elegir quién lo hizo desde la tarjeta del turno.</p>
          </div>
        </li>
      )}
    </ul>
  );
}
