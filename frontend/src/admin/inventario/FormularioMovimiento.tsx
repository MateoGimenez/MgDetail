import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Insumo } from '../../api/inventario';
import { Icono } from '../../components/Icono';
import { leerMonto } from '../../lib/cobro';
import {
  LIMITES_INSUMO,
  costoPorUnidad,
  formatoCantidad,
  formularioMovimientoVacio,
  leerCantidad,
  textoDeDiferencia,
  validarMovimiento,
  type CuerpoMovimiento,
  type ErroresMovimiento,
  type TipoMovimiento,
} from '../../lib/inventario';
import { useMontado } from '../dialogo';
import { ErrorCampo } from '../ErroresFormulario';
import type { Problema } from '../useUsuarios';

interface Props {
  insumo: Insumo;
  tipo: TipoMovimiento;
  /** Manda el movimiento; null si quedó anotado. */
  alEnviar: (cuerpo: CuerpoMovimiento) => Promise<Problema | null>;
  alTerminar: () => void;
}

const TEXTOS: Readonly<
  Record<TipoMovimiento, { titulo: string; cantidad: string; boton: string; ayuda: string; notaEtiqueta: string; notaEjemplo: string }>
> = {
  uso: {
    titulo: 'Anotar lo que usaste',
    cantidad: '¿Cuánto usaste?',
    boton: 'Anotar uso',
    ayuda: 'Se resta del stock. Si te equivocaste, un admin lo corrige con Ajustar.',
    notaEtiqueta: '¿En qué trabajo?',
    notaEjemplo: 'Ej.: pulido del Corsa',
  },
  compra: {
    titulo: 'Cargar una compra',
    cantidad: '¿Cuánto compraste?',
    boton: 'Cargar compra',
    ayuda: 'Se suma al stock.',
    notaEtiqueta: 'Nota',
    notaEjemplo: 'Ej.: factura 0001-1234',
  },
  ajuste: {
    titulo: 'Contar y ajustar el stock',
    cantidad: '¿Cuánto hay ahora?',
    boton: 'Ajustar stock',
    ayuda: 'Contá lo que hay en el estante y escribilo: el sistema calcula la diferencia.',
    notaEtiqueta: 'Motivo',
    notaEjemplo: 'Ej.: conteo del mes',
  },
};

const CAMPO_CANTIDAD: Record<TipoMovimiento, 'cantidad' | 'stockReal'> = { uso: 'cantidad', compra: 'cantidad', ajuste: 'stockReal' };

/**
 * Uso, compra o ajuste de un insumo, dentro de la misma tarjeta (sin otro modal encima). Los errores del backend
 * (`fields.cantidad` con STOCK_INSUFICIENTE, `fields.costoTotal`…) caen en su campo y lo escrito no se pierde.
 */
export function FormularioMovimiento({ insumo, tipo, alEnviar, alTerminar }: Props) {
  const id = useId();
  const montado = useMontado();
  const formRef = useRef<HTMLFormElement>(null);
  const textos = TEXTOS[tipo];
  const campoCantidad = CAMPO_CANTIDAD[tipo];
  const [valores, setValores] = useState(formularioMovimientoVacio);
  const [errores, setErrores] = useState<ErroresMovimiento>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('input')?.focus();
  }, []);

  const cambiar = (campo: keyof typeof valores, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    // Al corregir un campo se borra su error (el del campo de cantidad puede ser "Solo quedan…").
    setErrores((e) => ({ ...e, [campo === 'cantidad' ? campoCantidad : campo]: undefined }));
  };

  const enfocarInvalido = () => {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setGeneral(null);
    const validacion = validarMovimiento(tipo, valores);
    if (!validacion.ok) {
      setErrores(validacion.errores);
      enfocarInvalido();
      return;
    }
    setErrores({});
    setEnviando(true);
    const problema = await alEnviar(validacion.cuerpo);
    if (!montado.current) return;
    setEnviando(false);
    if (!problema) {
      alTerminar();
      return;
    }
    const campos = problema.campos ?? {};
    const deCampos: ErroresMovimiento = {
      [campoCantidad]: campos.cantidad ?? campos.stockReal,
      costoTotal: campos.costoTotal,
      proveedor: campos.proveedor,
      nota: campos.nota,
    };
    setErrores(deCampos);
    if (Object.values(deCampos).some(Boolean)) enfocarInvalido();
    else setGeneral(problema.mensaje);
  };

  const unidad = insumo.unidad;
  const cantidadLeida = leerCantidad(valores.cantidad, { cero: tipo === 'ajuste' });
  const costoLeido = leerMonto(valores.costoTotal);
  const ayudaCompra =
    tipo === 'compra' && 'valor' in cantidadLeida && 'valor' in costoLeido
      ? costoPorUnidad(cantidadLeida.valor, costoLeido.valor, unidad)
      : null;
  const diferencia = tipo === 'ajuste' && 'valor' in cantidadLeida ? textoDeDiferencia(insumo.stock, cantidadLeida.valor, unidad) : null;
  const errorCantidad = errores[campoCantidad];
  const campo = (nombre: string) => `${id}-${nombre}`;
  const describir = (nombre: string, error: string | undefined, ayuda?: boolean) =>
    [ayuda ? `${campo(nombre)}-ayuda` : null, error ? `${campo(nombre)}-error` : null].filter(Boolean).join(' ') || undefined;

  return (
    <form ref={formRef} className="inv-form" noValidate aria-labelledby={campo('titulo')} onSubmit={(e) => void enviar(e)}>
      <p id={campo('titulo')} className="cobro__titulo">
        {textos.titulo}
      </p>
      <p className="inv-form__contexto">
        {insumo.nombre} · ahora hay <strong>{formatoCantidad(insumo.stock, unidad)}</strong>
      </p>

      <fieldset className="cobro__campos" disabled={enviando}>
        <legend className="visualmente-oculto">{textos.titulo}</legend>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('cantidad')}>
            {textos.cantidad}
          </label>
          <div className="inv-form__con-unidad">
            <input
              id={campo('cantidad')}
              className="entrada"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="Ej.: 1,5"
              value={valores.cantidad}
              aria-invalid={errorCantidad ? true : undefined}
              aria-describedby={describir('cantidad', errorCantidad, true)}
              onChange={(e) => {
                cambiar('cantidad', e.target.value);
              }}
            />
            <span className="inv-form__unidad" aria-hidden="true">
              {formatoCantidad(1, unidad).replace(/^1 /, '')}
            </span>
          </div>
          <p id={campo('cantidad-ayuda')} className="campo__ayuda">
            {diferencia ?? textos.ayuda}
          </p>
          <ErrorCampo id={campo('cantidad-error')} mensaje={errorCantidad} />
        </div>

        {tipo === 'compra' && (
          <>
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={campo('costo')}>
                ¿Cuánto pagaste en total? <span className="campo__opcional">(opcional)</span>
              </label>
              <input
                id={campo('costo')}
                className="entrada"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="$ 12.500"
                value={valores.costoTotal}
                aria-invalid={errores.costoTotal ? true : undefined}
                aria-describedby={describir('costo', errores.costoTotal, true)}
                onChange={(e) => {
                  cambiar('costoTotal', e.target.value);
                }}
              />
              <p id={campo('costo-ayuda')} className="campo__ayuda">
                {ayudaCompra ? `Sale ${ayudaCompra}. ` : ''}
                Si lo cargás, se anota solo como gasto en Finanzas.
              </p>
              <ErrorCampo id={campo('costo-error')} mensaje={errores.costoTotal} />
            </div>
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={campo('proveedor')}>
                Proveedor <span className="campo__opcional">(opcional)</span>
              </label>
              <input
                id={campo('proveedor')}
                className="entrada"
                type="text"
                autoComplete="off"
                maxLength={LIMITES_INSUMO.proveedor}
                value={valores.proveedor}
                aria-invalid={errores.proveedor ? true : undefined}
                aria-describedby={describir('proveedor', errores.proveedor)}
                onChange={(e) => {
                  cambiar('proveedor', e.target.value);
                }}
              />
              <ErrorCampo id={campo('proveedor-error')} mensaje={errores.proveedor} />
            </div>
          </>
        )}

        <div className="campo">
          <label className="campo__etiqueta" htmlFor={campo('nota')}>
            {textos.notaEtiqueta} <span className="campo__opcional">(opcional)</span>
          </label>
          <input
            id={campo('nota')}
            className="entrada"
            type="text"
            autoComplete="off"
            maxLength={LIMITES_INSUMO.nota}
            placeholder={textos.notaEjemplo}
            value={valores.nota}
            aria-invalid={errores.nota ? true : undefined}
            aria-describedby={describir('nota', errores.nota)}
            onChange={(e) => {
              cambiar('nota', e.target.value);
            }}
          />
          <ErrorCampo id={campo('nota-error')} mensaje={errores.nota} />
        </div>
      </fieldset>

      {general && (
        <p className="turno__error" role="alert">
          <Icono nombre="alerta" tamano={18} />
          {general}
        </p>
      )}

      <div className="cobro__acciones">
        <button type="submit" className="boton boton--primario boton--chico" disabled={enviando}>
          <Icono nombre="check" tamano={18} />
          {enviando ? 'Guardando…' : textos.boton}
        </button>
        <button type="button" className="boton boton--fantasma boton--chico" disabled={enviando} onClick={alTerminar}>
          Volver
        </button>
      </div>
    </form>
  );
}
