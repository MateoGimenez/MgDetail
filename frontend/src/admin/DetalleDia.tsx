import { useId, useState, type FormEvent } from 'react';
import { MOTIVO_MAXIMO, type HorarioDia } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import {
  accionDelBorrador,
  avisoDeTurnos,
  borradorDe,
  turnosDelDia,
  type Accion,
  type Borrador,
  type EstadoDelDia,
  type FranjaDelDia,
} from '../lib/calendarioPanel';
import { NOMBRE_DIA_SEMANA, diaDelHorario, leerMotivo, resumenDeCupos } from '../lib/cupos';
import { diaConMes } from '../lib/fechas';
import { Interruptor, Pasos } from './ControlesCupo';
import { useMontado } from './dialogo';
import { Contador, ErrorCampo, ErrorGeneral } from './ErroresFormulario';
import type { Problema } from './useUsuarios';

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

const agendados = (n: number) => (n === 1 ? '1 turno agendado' : `${String(n)} turnos agendados`);

/** "1 de 2 ocupados", "Sin turnos", "2 lugares" (si no se sabe cuántos hay). */
function textoOcupacion(f: FranjaDelDia): string {
  if (f.cupo === 0) return f.ocupados ? `Sin cupo · ${agendados(f.ocupados)}` : 'Sin turnos';
  if (f.ocupados === null) return f.cupo === 1 ? '1 lugar' : `${String(f.cupo)} lugares`;
  return `${String(f.ocupados)} de ${String(f.cupo)} ocupados`;
}

interface Props {
  estado: EstadoDelDia;
  /** YYYY-MM-DD de hoy (La Rioja): el título lleva el año si es otro. */
  hoy: string;
  horario: readonly HorarioDia[];
  editable: boolean;
  idTitulo: string;
  /** Aplica lo que haya que hacer (PUT o DELETE). null si salió bien o el problema. */
  alAplicar: (accion: Accion) => Promise<Problema | null>;
}

/**
 * Detalle de un día: fecha, feriado, turnos por franja y, para quien puede editar, los controles directos (día
 * abierto, cada franja con su cupo, motivo, volver al horario habitual). Se usa en el panel del costado (pantalla
 * ancha) y en la hoja que sube desde abajo (celular). Se remonta con cada cambio guardado (key), así el borrador
 * arranca de lo que quedó.
 */
export function DetalleDia({ estado, hoy, horario, editable, idTitulo, alAplicar }: Props) {
  const id = useId();
  const montado = useMontado();
  const [original] = useState(() => borradorDe(estado, horario));
  const [b, setB] = useState<Borrador>(original);
  const [errorMotivo, setErrorMotivo] = useState<string | undefined>();
  const [problema, setProblema] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<'guardar' | 'quitar' | null>(null);

  const semanal = horario.find((h) => h.dia === diaDelHorario(estado.fecha));
  const nombreSemanal = (NOMBRE_DIA_SEMANA[diaDelHorario(estado.fecha)] ?? '').toLowerCase();
  const habitual = semanal ? resumenDeCupos(semanal.abierto, semanal.cupoManana, semanal.cupoTarde) : 'Cerrado';
  const puedeEditar = editable && !estado.pasado;
  const accion = accionDelBorrador(b, estado, horario);
  const aviso = puedeEditar ? avisoDeTurnos(b, estado) : null;
  const cambiar = (cambio: Partial<Borrador>) => {
    setB((previo) => ({ ...previo, ...cambio }));
    setProblema(null);
  };

  const aplicar = async (que: Accion, tipo: 'guardar' | 'quitar') => {
    setGuardando(tipo);
    setProblema(null);
    const resultado = await alAplicar(que);
    if (!montado.current) return;
    setGuardando(null);
    if (resultado) {
      setProblema(resultado.mensaje);
      if (resultado.campos?.motivo) setErrorMotivo(resultado.campos.motivo);
    }
  };

  const enviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const motivo = leerMotivo(b.motivo);
    if ('error' in motivo) {
      setErrorMotivo(motivo.error);
      document.getElementById(`${id}-motivo`)?.focus();
      return;
    }
    setErrorMotivo(undefined);
    if (accion.tipo === 'nada') return;
    void aplicar(accion, accion.tipo === 'quitar' ? 'quitar' : 'guardar');
  };

  const cabeza = (
    <div className="detalle-dia__cabeza">
      <h2 id={idTitulo} className="detalle-dia__titulo" tabIndex={-1}>
        {conMayuscula(diaConMes(estado.fecha))}
        {estado.fecha.slice(0, 4) !== hoy.slice(0, 4) && ` de ${estado.fecha.slice(0, 4)}`}
      </h2>
      <div className="detalle-dia__marcas">
        {estado.hoy && <span className="marca-dia marca-dia--hoy">Hoy</span>}
        {estado.feriado && <span className="marca-dia">Feriado</span>}
        {estado.aMano && <span className="marca-dia marca-dia--mano">Cambiado a mano</span>}
        {!estado.abierto && <span className="marca-dia marca-dia--cerrado">Cerrado</span>}
      </div>
      {estado.feriado && <p className="detalle-dia__feriado">{estado.feriado.nombre}</p>}
      {estado.feriado?.trasladable && (
        <p className="detalle-dia__nota">
          <Icono nombre="alerta" tamano={16} />
          Feriado trasladable: confirmá la fecha cuando el gobierno la publique.
        </p>
      )}
      {estado.especial?.motivo && !estado.feriado && <p className="detalle-dia__feriado">{estado.especial.motivo}</p>}
    </div>
  );

  const ocupacion = (
    <dl className="detalle-dia__ocupacion">
      <div>
        <dt>Mañana</dt>
        <dd>{textoOcupacion(estado.manana)}</dd>
      </div>
      <div>
        <dt>Tarde</dt>
        <dd>{textoOcupacion(estado.tarde)}</dd>
      </div>
    </dl>
  );

  if (!puedeEditar) {
    return (
      <div className="detalle-dia">
        {cabeza}
        {estado.abierto || turnosDelDia(estado) > 0 ? ocupacion : <p className="detalle-dia__texto">No se toman turnos.</p>}
        <p className="detalle-dia__habitual">
          {estado.pasado
            ? 'Este día ya pasó: no se puede cambiar.'
            : 'Lo que figura acá es lo que la web deja pedir. Para cambiarlo, pedíselo a un admin.'}
        </p>
      </div>
    );
  }

  const franjas = (
    [
      ['manana', 'Mañana', 'a la mañana', estado.manana],
      ['tarde', 'Tarde', 'a la tarde', estado.tarde],
    ] as const
  ).map(([clave, etiqueta, nombre, actual]) => {
    const activa = clave === 'manana' ? b.mananaActiva : b.tardeActiva;
    const cupo = clave === 'manana' ? b.cupoManana : b.cupoTarde;
    return (
      <div key={clave} className={activa ? 'detalle-dia__franja' : 'detalle-dia__franja detalle-dia__franja--apagada'}>
        <Interruptor
          etiqueta={etiqueta}
          activo={activa}
          textoSi="Recibe turnos"
          textoNo="Sin turnos"
          deshabilitado={guardando !== null}
          describe={`${id}-${clave}-ocupados`}
          alCambiar={(valor) => {
            cambiar(clave === 'manana' ? { mananaActiva: valor } : { tardeActiva: valor });
          }}
        />
        <div className="detalle-dia__cupo">
          <p id={`${id}-${clave}-ocupados`} className="detalle-dia__agendados">
            {actual.ocupados === null
              ? 'No sabemos cuántos turnos hay.'
              : actual.ocupados === 0
                ? 'Nada agendado'
                : agendados(actual.ocupados)}
          </p>
          {activa && (
            <Pasos
              nombre={nombre}
              valor={cupo}
              minimo={1}
              deshabilitado={guardando !== null}
              alCambiar={(valor) => {
                cambiar(clave === 'manana' ? { cupoManana: valor } : { cupoTarde: valor });
              }}
            />
          )}
        </div>
      </div>
    );
  });

  return (
    <form className="detalle-dia" noValidate aria-labelledby={idTitulo} onSubmit={enviar}>
      {cabeza}

      <div className="detalle-dia__bloque">
        <Interruptor
          etiqueta="Atiende ese día"
          activo={b.abierto}
          textoSi="Abierto"
          textoNo="Cerrado"
          deshabilitado={guardando !== null}
          alCambiar={(valor) => {
            cambiar({ abierto: valor });
          }}
        />
        {b.abierto ? (
          <div className="detalle-dia__franjas">{franjas}</div>
        ) : (
          <p className="detalle-dia__texto">
            No recibe pedidos.
            {turnosDelDia(estado) > 0 && ` Hay ${agendados(turnosDelDia(estado))}.`}
          </p>
        )}
      </div>

      <div className="campo">
        <label className="campo__etiqueta" htmlFor={`${id}-motivo`}>
          Motivo <span className="campo__opcional">(opcional)</span>
        </label>
        <input
          id={`${id}-motivo`}
          className="entrada"
          type="text"
          maxLength={MOTIVO_MAXIMO}
          placeholder="Ej.: Vacaciones"
          value={b.motivo}
          disabled={guardando !== null}
          aria-invalid={errorMotivo ? true : undefined}
          aria-describedby={[`${id}-motivo-ayuda`, errorMotivo ? `${id}-motivo-error` : null].filter(Boolean).join(' ')}
          onChange={(evento) => {
            cambiar({ motivo: evento.target.value });
          }}
        />
        <p id={`${id}-motivo-ayuda`} className="campo__ayuda servicio-form__ayuda-fila">
          Lo ves vos en el panel; el cliente no.
          <Contador valor={b.motivo} max={MOTIVO_MAXIMO} />
        </p>
        <ErrorCampo id={`${id}-motivo-error`} mensaje={errorMotivo} />
      </div>

      <p className="fecha-turno__aviso" role="status">
        {aviso && (
          <>
            <Icono nombre="alerta" tamano={18} />
            {aviso}
          </>
        )}
      </p>
      <ErrorGeneral mensaje={problema} />

      <div className="detalle-dia__acciones">
        <button type="submit" className="boton boton--primario boton--chico" disabled={accion.tipo === 'nada' || guardando !== null}>
          <Icono nombre="check" tamano={18} />
          {guardando === 'guardar' ? 'Guardando…' : 'Guardar'}
        </button>
        {accion.tipo !== 'nada' && (
          <button
            type="button"
            className="boton boton--fantasma boton--chico"
            disabled={guardando !== null}
            onClick={() => {
              setB(original);
              setProblema(null);
              setErrorMotivo(undefined);
            }}
          >
            Descartar
          </button>
        )}
      </div>

      <div className="detalle-dia__habitual">
        <p>
          Horario habitual de los {nombreSemanal}: {habitual.toLowerCase()}.
        </p>
        {estado.especial && (
          <button
            type="button"
            className="boton boton--secundario boton--chico"
            disabled={guardando !== null}
            onClick={() => {
              void aplicar({ tipo: 'quitar' }, 'quitar');
            }}
          >
            <Icono nombre="refrescar" tamano={18} />
            {guardando === 'quitar' ? 'Volviendo…' : 'Volver al horario habitual'}
          </button>
        )}
      </div>
    </form>
  );
}
