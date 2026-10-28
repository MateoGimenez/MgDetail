import { obtenerEstadisticas, type Estadisticas } from '../../api/estadisticas';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import { hoyEnLaRioja } from '../../lib/fechas';
import { etiquetaDelMes, mesDeFecha, pesosConSigno } from '../../lib/finanzas';
import type { PropsSeccion } from '../secciones';
import { MetaDelMes } from './MetaDelMes';
import { useMetaActual } from './useMetaActual';
import { useCarga } from './useCarga';
import './finanzas.css';

type Mes = Estadisticas['resumen']['mes']['actual'];

/** El mes en curso sale del resumen de las estadísticas; pedir un solo día alcanza y trae poco. */
const pedirElMes = (hoy: string, signal: AbortSignal): Promise<Mes> =>
  obtenerEstadisticas({ desde: hoy, hasta: hoy }, signal).then((e) => e.resumen.mes.actual);

interface Props {
  alVencerSesion: (mensaje: string) => void;
  irA: PropsSeccion['irA'];
  /** Cambia con "Actualizar" de Hoy. */
  version: number;
}

/**
 * Hoy, solo admin y superadmin: la ganancia neta del mes (lo cobrado menos lo gastado) y la meta del mes con su
 * barra. Son un extra de Hoy: si fallan avisan con "Reintentar" y no tocan el resto de la pantalla.
 */
export function TarjetaDelMes({ alVencerSesion, irA, version }: Props) {
  const hoy = hoyEnLaRioja(new Date());
  const mes = useCarga(pedirElMes, hoy, `mes|${hoy}|${String(version)}`, alVencerSesion);
  const meta = useMetaActual(alVencerSesion, version);
  const d = mes.datos;
  const negativa = d !== null && d.ganancia < 0;

  return (
    <section className="hoy__tarjeta hoy__mes" aria-labelledby="hoy-mes">
      <h2 id="hoy-mes" className="hoy__titulo">
        Este mes <span className="hoy__mes-nombre">· {etiquetaDelMes(mesDeFecha(hoy))}</span>
      </h2>
      <div className="hoy__mes-cuerpo">
        <div className="hoy__mes-neta" aria-busy={mes.cargando}>
          {d === null && mes.cargando && (
            <div className="meta-del-mes__esqueleto" aria-hidden="true">
              <span className="esq esq--s" />
              <span className="esq esq--m esq--titulo" />
              <span className="esq esq--l" />
            </div>
          )}
          {mes.error && (
            <div className="meta-del-mes__error" role="alert">
              <p>
                <Icono nombre="alerta" tamano={18} />
                No pudimos calcular la ganancia del mes. {mes.error}
              </p>
              <button type="button" className="boton boton--secundario boton--chico" onClick={mes.recargar}>
                Reintentar
              </button>
            </div>
          )}
          {d && (
            <>
              <p className="hoy__mes-rotulo">Ganancia neta</p>
              <p className={negativa ? 'hoy__mes-valor hoy__mes-valor--negativa' : 'hoy__mes-valor'}>{pesosConSigno(d.ganancia)}</p>
              <p className="hoy__mes-detalle">
                Cobraste {formatoPesos(d.ingresos)} y gastaste {formatoPesos(d.gastos)}.
              </p>
              <button
                type="button"
                className="boton boton--secundario boton--chico hoy__ver"
                onClick={() => {
                  irA('finanzas');
                }}
              >
                Ver finanzas
                <Icono nombre="flecha" tamano={18} />
              </button>
            </>
          )}
        </div>
        <MetaDelMes carga={meta} irA={irA} anidada />
      </div>
    </section>
  );
}
