import type { Granularidad, MisTrabajos } from '../../api/estadisticas';
import { entero, etiquetaDeClave, etiquetaDeEje, trabajos } from '../../lib/estadisticas';
import { tablaMisDias, tablaMisServicios } from '../../lib/tablasEstadisticas';
import { GraficoColumnas, type Columna } from './graficos/GraficoColumnas';
import { MarcoGrafico } from './graficos/MarcoGrafico';
import { RankingBarras, type FilaRanking } from './graficos/RankingBarras';

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** "Mis trabajos": los trabajos completados por esta persona, por día (o mes) y por servicio. Sin importes. */
export function GraficosMisTrabajos({ datos, granularidad }: { datos: MisTrabajos; granularidad: Granularidad }) {
  const unidad = granularidad === 'dia' ? 'día' : 'mes';
  const columnas: Columna[] = datos.serie.map((p, i) => ({
    clave: p.clave,
    valor: p.completados,
    etiquetaEje: etiquetaDeEje(p.clave, i),
    titulo: conMayuscula(etiquetaDeClave(p.clave)),
    detalle: trabajos(p.completados),
  }));
  const servicios: FilaRanking[] = datos.porServicio.map((s, i) => ({
    id: s.servicioId,
    etiqueta: s.nombre,
    valor: s.completados,
    textoValor: trabajos(s.completados),
    detalle: '',
    enfasis: i === 0 && s.completados > 0,
  }));

  return (
    <div className="est-graficos">
      <div className="est-graficos__ancho">
        <MarcoGrafico
          titulo={`Tus trabajos por ${unidad}`}
          ayuda={`Cuántos trabajos completaste cada ${unidad}. En rojo, el ${unidad} con más.`}
          resumen={`Completaste ${trabajos(datos.completados)} en el período.`}
          tabla={tablaMisDias(datos.serie, granularidad)}
        >
          {(ids) => (
            <GraficoColumnas
              columnas={columnas}
              idTitulo={ids.titulo}
              idResumen={ids.resumen}
              formatoEje={entero}
              soloEnteros
              fraseDelMaximo={(c) => `El ${unidad} con más: ${c.titulo.toLowerCase()}, ${trabajos(c.valor)}.`}
            />
          )}
        </MarcoGrafico>
      </div>
      <MarcoGrafico
        titulo="Tus trabajos por servicio"
        ayuda="Los servicios que más hiciste."
        resumen={servicios[0] ? `Lo que más hiciste fue ${servicios[0].etiqueta}, ${servicios[0].textoValor}.` : 'Todavía no completaste trabajos en este período.'}
        tabla={tablaMisServicios(datos.porServicio)}
      >
        {(ids) => <RankingBarras filas={servicios} idTitulo={ids.titulo} idResumen={ids.resumen} nombrePlural="servicios" />}
      </MarcoGrafico>
    </div>
  );
}
