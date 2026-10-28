import { useEffect, useState } from 'react';
import { Icono } from '../components/Icono';
import { whatsappUrl } from '../config/enlaces';
import { ID_SECCION_RESERVA } from './reserva-contexto';
import { useDesplazado } from './useDesplazado';

/** Cuánto hay que desplazar la página para que aparezca (que no tape la portada). */
const UMBRAL = 320;

/**
 * Botón flotante de WhatsApp, abajo a la derecha. Aparece con un pequeño scroll y se corre mientras se ve el
 * formulario de reserva (para no tapar su botón de enviar). Con `mensaje` prearmado; solo existe si `sitio.whatsapp`
 * tiene un número. Sin movimiento reducido, entra sin animación (landing.css / efectos.css).
 */
export function BotonWhatsapp({ mensaje }: { mensaje: string }) {
  const desplazado = useDesplazado(UMBRAL);
  const [enReserva, setEnReserva] = useState(false);

  useEffect(() => {
    const formulario = document.getElementById(ID_SECCION_RESERVA);
    if (!formulario || typeof IntersectionObserver === 'undefined') return;
    const observador = new IntersectionObserver(([entrada]) => {
      setEnReserva(entrada?.isIntersecting ?? false);
    });
    observador.observe(formulario);
    return () => {
      observador.disconnect();
    };
  }, []);

  const url = whatsappUrl(mensaje);
  if (!url) return null;

  return (
    <a
      className="whatsapp-flotante boton boton--primario"
      data-visible={desplazado && !enReserva}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp (se abre en otra pestaña)"
    >
      <Icono nombre="whatsapp" tamano={28} />
      <span className="whatsapp-flotante__texto" aria-hidden="true">
        Escribinos
      </span>
    </a>
  );
}
