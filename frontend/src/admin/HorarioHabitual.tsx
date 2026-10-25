import { useState } from 'react';
import type { HorarioDia } from '../api/contract-panel';
import { Icono } from '../components/Icono';
import { NOMBRE_DIA_SEMANA, horarioOrdenado, resumenDeCupos } from '../lib/cupos';
import { Interruptor, Pasos } from './ControlesCupo';
import { useMontado } from './dialogo';
import { ErrorGeneral } from './ErroresFormulario';
import type { Problema } from './useUsuarios';

/**
 * El horario de siempre (lunes a domingo): si se atiende y cuántos turnos entran por franja, con − y +. Es la regla
 * de fondo del calendario: un día cambiado a mano gana sobre esto. Se remonta cuando cambia lo guardado (key).
 */
export function HorarioHabitual({
  horario,
  editable,
  alGuardar,
}: {
  horario: readonly HorarioDia[];
  editable: boolean;
  alGuardar: (dias: HorarioDia[]) => Promise<Problema | null>;
}) {
  const montado = useMontado();
  const [original] = useState(() => horarioOrdenado(horario));
  const [filas, setFilas] = useState(original);
  const [problema, setProblema] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiado = JSON.stringify(filas) !== JSON.stringify(original);

  if (!editable) {
    return (
      <ul role="list" className="habitual habitual--lectura">
        {original.map((h) => (
          <li key={h.dia} className={h.abierto ? 'habitual__fila' : 'habitual__fila habitual__fila--cerrada'}>
            <span className="habitual__dia">{NOMBRE_DIA_SEMANA[h.dia]}</span>
            <span className="habitual__resumen">{resumenDeCupos(h.abierto, h.cupoManana, h.cupoTarde)}</span>
          </li>
        ))}
      </ul>
    );
  }

  const cambiar = (dia: number, cambio: Partial<HorarioDia>) => {
    setFilas((actuales) => actuales.map((f) => (f.dia === dia ? { ...f, ...cambio } : f)));
    setProblema(null);
  };

  const guardar = async () => {
    setGuardando(true);
    setProblema(null);
    const resultado = await alGuardar(filas);
    if (!montado.current) return;
    setGuardando(false);
    if (resultado) setProblema(resultado.mensaje);
  };

  return (
    <div className="habitual-form">
      <ul role="list" className="habitual">
        {filas.map((f) => {
          const nombre = NOMBRE_DIA_SEMANA[f.dia] ?? '';
          const del = nombre.toLowerCase();
          return (
            <li key={f.dia} className={f.abierto ? 'habitual__fila' : 'habitual__fila habitual__fila--cerrada'}>
              <Interruptor
                etiqueta={nombre}
                activo={f.abierto}
                textoSi="Abierto"
                textoNo="Cerrado"
                deshabilitado={guardando}
                alCambiar={(abierto) => {
                  cambiar(f.dia, { abierto });
                }}
              />
              {f.abierto && (
                <div className="habitual__cupos">
                  <div className="habitual__cupo">
                    <span className="habitual__etiqueta" aria-hidden="true">
                      Mañana
                    </span>
                    <Pasos
                      nombre={`a la mañana del ${del}`}
                      valor={f.cupoManana}
                      minimo={0}
                      deshabilitado={guardando}
                      alCambiar={(cupoManana) => {
                        cambiar(f.dia, { cupoManana });
                      }}
                    />
                  </div>
                  <div className="habitual__cupo">
                    <span className="habitual__etiqueta" aria-hidden="true">
                      Tarde
                    </span>
                    <Pasos
                      nombre={`a la tarde del ${del}`}
                      valor={f.cupoTarde}
                      minimo={0}
                      deshabilitado={guardando}
                      alCambiar={(cupoTarde) => {
                        cambiar(f.dia, { cupoTarde });
                      }}
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="campo__ayuda">
        Turnos por franja, de 0 a 20 (0 = esa franja no recibe pedidos). Los pendientes también ocupan lugar. Los días
        cambiados a mano en el calendario no cambian.
      </p>
      <ErrorGeneral mensaje={problema} />
      <div className="detalle-dia__acciones">
        <button
          type="button"
          className="boton boton--primario boton--chico"
          disabled={!cambiado || guardando}
          onClick={() => {
            void guardar();
          }}
        >
          <Icono nombre="check" tamano={18} />
          {guardando ? 'Guardando…' : 'Guardar horario'}
        </button>
        {cambiado && (
          <button
            type="button"
            className="boton boton--fantasma boton--chico"
            disabled={guardando}
            onClick={() => {
              setFilas(original);
              setProblema(null);
            }}
          >
            Descartar
          </button>
        )}
      </div>
    </div>
  );
}
