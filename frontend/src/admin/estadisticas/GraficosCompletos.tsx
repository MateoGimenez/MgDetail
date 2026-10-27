import type { Estadisticas } from '../../api/estadisticas';
import {
  DIAS_SEMANA_BACKEND,
  entero,
  etiquetaDeClave,
  etiquetaDeEje,
  momentoMasMovido,
  partesPorEstado,
  pedidos,
  pesos,
  pesosCorto,
  trabajos,
} from '../../lib/estadisticas';
import {
  diasEnOrden,
  tablaDiaSemana,
  tablaEquipo,
  tablaEstados,
  tablaIngresos,
  tablaServicios,
} from '../../lib/tablasEstadisticas';
import { EstadoDeTurnos } from './graficos/EstadoDeTurnos';
import { GraficoColumnas, type Columna } from './graficos/GraficoColumnas';
import { MapaDeCalor } from './graficos/MapaDeCalor';
import { MarcoGrafico } from './graficos/MarcoGrafico';
import { RankingBarras, type FilaRanking } from './graficos/RankingBarras';

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Los cinco gráficos de las estadísticas completas (admin y superadmin), con los datos del período elegido. */
export function GraficosCompletos({ datos }: { datos: Estadisticas }) {
  const { periodo, serie, granularidad } = datos;
  const unidad = granularidad === 'dia' ? 'día' : 'mes';

  /* ----- Ingresos en el tiempo ----- */
  const columnas: Columna[] = serie.map((p, i) => ({
    clave: p.clave,
    valor: p.ingresos,
    etiquetaEje: etiquetaDeEje(p.clave, i),
    titulo: conMayuscula(etiquetaDeClave(p.clave)),
    detalle: `${pesos(p.ingresos)} · ${trabajos(p.completados)}`,
  }));
  const mejor = columnas.reduce<Columna | null>((m, c) => (c.valor > (m?.valor ?? 0) ? c : m), null);

  /* ----- Servicios ----- */
  const primeroConPedidos = datos.porServicio.findIndex((s) => s.pedidos > 0);
  const servicios: FilaRanking[] = datos.porServicio.map((s, i) => ({
    id: s.servicioId,
    etiqueta: s.nombre,
    valor: s.completados,
    valorTotal: s.pedidos,
    textoValor: pesos(s.ingresos),
    detalle: `${pedidos(s.pedidos)} · ${entero(s.completados)} ${s.completados === 1 ? 'completado' : 'completados'}`,
    enfasis: i === primeroConPedidos,
  }));
  const masPedido = datos.porServicio[primeroConPedidos];

  /* ----- Equipo ----- */
  const primeroConTrabajos = datos.porTrabajador.findIndex((t) => t.id !== null && t.completados > 0);
  const equipo: FilaRanking[] = datos.porTrabajador.map((t, i) => ({
    id: t.id ?? 'sin-asignar',
    etiqueta: t.nombre,
    valor: t.completados,
    textoValor: trabajos(t.completados),
    detalle: `${pesos(t.ingresos)} cobrados`,
    enfasis: i === primeroConTrabajos,
    sinAsignar: t.id === null,
  }));
  const quienMas = datos.porTrabajador[primeroConTrabajos];

  /* ----- Cuándo vienen ----- */
  const semana = diasEnOrden(datos.porDiaSemana);
  const movido = momentoMasMovido(semana);

  const partes = partesPorEstado(periodo);

  return (
    <div className="est-graficos">
      <div className="est-graficos__ancho">
        {periodo.ingresos > 0 ? (
          <MarcoGrafico
            titulo="Ingresos en el tiempo"
            ayuda={`Lo cobrado por ${unidad}. En rojo, el mejor ${unidad}.`}
            resumen={`Ingresos del período: ${pesos(periodo.ingresos)}.${mejor ? ` El mejor ${unidad} fue ${mejor.titulo.toLowerCase()}, con ${pesos(mejor.valor)}.` : ''}`}
            tabla={tablaIngresos(serie, granularidad)}
          >
            {(ids) => (
              <GraficoColumnas
                columnas={columnas}
                idTitulo={ids.titulo}
                idResumen={ids.resumen}
                formatoEje={pesosCorto}
                fraseDelMaximo={(c) => `El mejor ${unidad}: ${c.titulo.toLowerCase()}, ${pesos(c.valor)}.`}
              />
            )}
          </MarcoGrafico>
        ) : (
          <MarcoGrafico
            titulo="Ingresos en el tiempo"
            ayuda={`Lo cobrado por ${unidad}.`}
            resumen="Todavía no hay ingresos cargados en este período."
            tabla={tablaIngresos(serie, granularidad)}
          >
            {() => (
              <p className="est-vacio-chico">
                Todavía no hay ingresos cargados en este período. Los ingresos salen del cobro que se carga al completar cada turno.
              </p>
            )}
          </MarcoGrafico>
        )}
      </div>

      <MarcoGrafico
        titulo="Servicios"
        ayuda="Los más pedidos primero. Atrás, los pedidos; adelante, los que ya se completaron."
        resumen={
          masPedido
            ? `El servicio más pedido fue ${masPedido.nombre}, con ${pedidos(masPedido.pedidos)} y ${pesos(masPedido.ingresos)} de ingresos.`
            : 'Todavía no hubo pedidos de servicios en este período.'
        }
        tabla={tablaServicios(datos.porServicio, true)}
      >
        {(ids) =>
          servicios.length === 0 ? (
            <p className="est-vacio-chico">No hay servicios para mostrar.</p>
          ) : (
            <RankingBarras
              filas={servicios}
              idTitulo={ids.titulo}
              idResumen={ids.resumen}
              leyenda={{ total: 'Pedidos', valor: 'Completados' }}
              nombrePlural="servicios"
            />
          )
        }
      </MarcoGrafico>

      <MarcoGrafico
        titulo="Equipo"
        ayuda="Quién completó más trabajos en el período, con lo que se cobró en cada uno."
        resumen={
          quienMas
            ? `Quien más trabajos completó fue ${quienMas.nombre}, con ${trabajos(quienMas.completados)}.`
            : 'Todavía no hay trabajos completados con trabajador en este período.'
        }
        tabla={tablaEquipo(datos.porTrabajador)}
      >
        {(ids) =>
          equipo.length === 0 ? (
            <p className="est-vacio-chico">Todavía no hay trabajos completados en este período.</p>
          ) : (
            <RankingBarras filas={equipo} idTitulo={ids.titulo} idResumen={ids.resumen} nombrePlural="personas" />
          )
        }
      </MarcoGrafico>

      <MarcoGrafico
        titulo="Cuándo vienen"
        ayuda="Pedidos por día de la semana, a la mañana y a la tarde. Cuanto más oscuro, más pedidos."
        resumen={
          movido
            ? `Lo más movido fue ${DIAS_SEMANA_BACKEND[movido.dia] ?? ''} ${movido.franja === 'manana' ? 'a la mañana' : 'a la tarde'}, con ${pedidos(movido.valor)}.`
            : 'Todavía no hubo pedidos en este período.'
        }
        tabla={tablaDiaSemana(datos.porDiaSemana)}
      >
        {(ids) => (
          <>
            <MapaDeCalor filas={semana} idTitulo={ids.titulo} idResumen={ids.resumen} />
            {movido && (
              <p className="est-nota">
                <span className="est-nota__marca est-nota__marca--calor" aria-hidden="true" />
                Lo más movido: {DIAS_SEMANA_BACKEND[movido.dia] ?? ''} {movido.franja === 'manana' ? 'a la mañana' : 'a la tarde'} (
                {pedidos(movido.valor)}).
              </p>
            )}
          </>
        )}
      </MarcoGrafico>

      <MarcoGrafico
        titulo="Estado de los turnos"
        ayuda="Cómo quedó cada turno del período, cancelados incluidos."
        resumen={`De ${entero(periodo.turnos)} turnos: ${partes.map((p) => `${entero(p.cantidad)} ${p.etiqueta.toLowerCase()}`).join(', ')}.`}
        tabla={tablaEstados(periodo)}
      >
        {(ids) => <EstadoDeTurnos partes={partes} idTitulo={ids.titulo} idResumen={ids.resumen} />}
      </MarcoGrafico>
    </div>
  );
}
