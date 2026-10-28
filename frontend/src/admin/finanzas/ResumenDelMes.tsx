import type { PeriodoEstadisticas } from '../../api/estadisticas';
import { Icono } from '../../components/Icono';
import { formatoPesos } from '../../lib/cobro';
import { pesosConSigno, textoMargen } from '../../lib/finanzas';

interface Props {
  periodo: PeriodoEstadisticas | null;
  cargando: boolean;
  error: string | null;
  alReintentar: () => void;
  /** "octubre de 2026", para el nombre de la región. */
  nombreDelMes: string;
}

/**
 * Lo que entró, lo que salió y lo que queda en el mes: ganancia neta al frente (ingresos menos gastos), con los
 * ingresos, los gastos y el margen al lado. Una ganancia negativa se escribe con el signo menos y una frase.
 */
export function ResumenDelMes({ periodo, cargando, error, alReintentar, nombreDelMes }: Props) {
  if (error && !periodo) {
    return (
      <div className="panel__error" role="alert">
        <Icono nombre="alerta" tamano={22} />
        <div>
          <p>No pudimos calcular el resumen del mes. {error}</p>
          <button type="button" className="boton boton--primario boton--chico" onClick={alReintentar}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!periodo) {
    return (
      <section className="fin-resumen fin-resumen--esqueleto" aria-hidden="true">
        <span className="esq esq--s" />
        <span className="esq esq--m esq--titulo" />
        <div className="fin-resumen__fila">
          <span className="esq esq--s" />
          <span className="esq esq--s" />
          <span className="esq esq--s" />
        </div>
      </section>
    );
  }

  const enNegativo = periodo.gananciaNeta < 0;
  return (
    <section className={cargando ? 'fin-resumen fin-resumen--obsoleto' : 'fin-resumen'} aria-labelledby="fin-resumen-titulo" aria-busy={cargando}>
      <h2 id="fin-resumen-titulo" className="visualmente-oculto">
        Resumen de {nombreDelMes}
      </h2>
      <dl className="fin-resumen__cifras">
        <div className="fin-cifra fin-cifra--neta">
          <dt className="fin-cifra__nombre">Ganancia neta</dt>
          <dd className={enNegativo ? 'fin-cifra__valor fin-cifra__valor--negativo' : 'fin-cifra__valor'}>
            {pesosConSigno(periodo.gananciaNeta)}
          </dd>
          <dd className="fin-cifra__nota">
            {enNegativo ? 'Gastaste más de lo que cobraste este mes.' : 'Lo que cobraste menos lo que gastaste.'}
          </dd>
        </div>
        <div className="fin-cifra">
          <dt className="fin-cifra__nombre">Ingresos</dt>
          <dd className="fin-cifra__valor fin-cifra__valor--chico">{formatoPesos(periodo.ingresos)}</dd>
        </div>
        <div className="fin-cifra">
          <dt className="fin-cifra__nombre">Gastos</dt>
          <dd className="fin-cifra__valor fin-cifra__valor--chico">{formatoPesos(periodo.gastos)}</dd>
        </div>
        <div className="fin-cifra">
          <dt className="fin-cifra__nombre">Margen</dt>
          <dd className="fin-cifra__valor fin-cifra__valor--chico">
            {periodo.margen === null ? (
              <>
                <span aria-hidden="true">—</span>
                <span className="visualmente-oculto">Sin ingresos para calcularlo</span>
              </>
            ) : (
              textoMargen(periodo.margen)
            )}
          </dd>
          <dd className="fin-cifra__nota">Qué parte de lo cobrado queda como ganancia.</dd>
        </div>
      </dl>
      {periodo.completadosSinMonto > 0 && (
        <p className="fin-resumen__aviso">
          <Icono nombre="alerta" tamano={18} />
          {periodo.completadosSinMonto === 1
            ? '1 trabajo completado no tiene el cobro cargado: todavía no suma a los ingresos.'
            : `${String(periodo.completadosSinMonto)} trabajos completados no tienen el cobro cargado: todavía no suman a los ingresos.`}
        </p>
      )}
    </section>
  );
}
