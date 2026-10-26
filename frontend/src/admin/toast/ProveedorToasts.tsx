import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icono } from '../../components/Icono';
import { ContextoAvisos, type Avisos } from './contexto';
import {
  DURACION_EXITO_MS,
  TOASTS_INICIAL,
  reducirToasts,
  seCierraSolo,
  type Toast,
} from './toasts';

/**
 * Altura de la barra fija de "Elegir varios días" (si está en pantalla), para apilar los avisos arriba de ella
 * y no taparla. Se mide con ResizeObserver y se publica como `--toasts-barra` en el contenedor.
 */
function useAlturaDeLaBarra(activo: boolean, destino: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = destino.current;
    if (!activo || !el) return;
    let observador: ResizeObserver | null = null;
    let barra: Element | null = null;
    const publicar = (alto: number) => {
      el.style.setProperty('--toasts-barra', `${String(Math.ceil(alto))}px`);
    };
    const enlazar = () => {
      const actual = document.querySelector('.varios-barra');
      if (actual === barra) return;
      observador?.disconnect();
      barra = actual;
      if (!barra) {
        publicar(0);
        return;
      }
      publicar(barra.getBoundingClientRect().height);
      if (typeof ResizeObserver !== 'undefined') {
        observador = new ResizeObserver(() => {
          if (barra) publicar(barra.getBoundingClientRect().height);
        });
        observador.observe(barra);
      }
    };
    enlazar();
    const cambios = new MutationObserver(enlazar);
    cambios.observe(document.body, { childList: true, subtree: true });
    return () => {
      cambios.disconnect();
      observador?.disconnect();
      el.style.removeProperty('--toasts-barra');
    };
  }, [activo, destino]);
}

function AvisoEnPantalla({ toast, alCerrar }: { toast: Toast; alCerrar: (id: number) => void }) {
  const [pausado, setPausado] = useState(false);
  const cierraSolo = seCierraSolo(toast);

  // Se cierra solo a los ~4 s; con el mouse encima o el foco adentro se pausa y vuelve a contar entero al salir.
  useEffect(() => {
    if (!cierraSolo || pausado) return;
    const reloj = setTimeout(() => {
      alCerrar(toast.id);
    }, DURACION_EXITO_MS);
    return () => {
      clearTimeout(reloj);
    };
  }, [cierraSolo, pausado, toast.id, alCerrar]);

  return (
    <li
      className={`toast toast--${toast.tipo}`}
      onPointerEnter={() => {
        setPausado(true);
      }}
      onPointerLeave={() => {
        setPausado(false);
      }}
      onFocus={() => {
        setPausado(true);
      }}
      onBlur={() => {
        setPausado(false);
      }}
    >
      <Icono nombre={toast.tipo === 'exito' ? 'check' : 'alerta'} tamano={20} className="toast__icono" />
      <p className="toast__texto">{toast.texto}</p>
      <button
        type="button"
        className="toast__cerrar"
        aria-label={toast.tipo === 'exito' ? 'Cerrar aviso' : 'Cerrar aviso de error'}
        onClick={() => {
          alCerrar(toast.id);
        }}
      >
        <Icono nombre="cerrar" tamano={18} />
      </button>
    </li>
  );
}

/**
 * Proveedor global de avisos del panel. Dos regiones siempre presentes (los lectores de pantalla anuncian mejor
 * lo que aparece en una región que ya estaba): éxitos en `role="status"` y errores en `role="alert"`.
 */
export function ProveedorToasts({ children }: { children: ReactNode }) {
  const [estado, enviar] = useReducer(reducirToasts, TOASTS_INICIAL);
  const raiz = useRef<HTMLDivElement>(null);

  const avisos = useMemo<Avisos>(
    () => ({
      exito: (texto) => {
        enviar({ tipo: 'agregar', toast: { tipo: 'exito', texto } });
      },
      error: (texto) => {
        enviar({ tipo: 'agregar', toast: { tipo: 'error', texto } });
      },
    }),
    [],
  );
  const cerrar = useCallback((id: number) => {
    enviar({ tipo: 'cerrar', id });
  }, []);

  useAlturaDeLaBarra(estado.items.length > 0, raiz);

  const exitos = estado.items.filter((t) => t.tipo === 'exito');
  const errores = estado.items.filter((t) => t.tipo === 'error');

  return (
    <ContextoAvisos value={avisos}>
      {children}
      <div ref={raiz} className="toasts">
        <div role="status" aria-live="polite" aria-atomic="false" className="toasts__zona">
          <ul role="list">
            {exitos.map((toast) => (
              <AvisoEnPantalla key={toast.id} toast={toast} alCerrar={cerrar} />
            ))}
          </ul>
        </div>
        <div role="alert" aria-atomic="false" className="toasts__zona">
          <ul role="list">
            {errores.map((toast) => (
              <AvisoEnPantalla key={toast.id} toast={toast} alCerrar={cerrar} />
            ))}
          </ul>
        </div>
      </div>
    </ContextoAvisos>
  );
}
