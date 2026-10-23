import { Icono } from '../components/Icono';
import { instagramArroba, instagramUrl, whatsappUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';

/**
 * Aviso para cuando el catálogo de la API llega vacío (el dueño desactivó todos los servicios): por ahora no se
 * toman turnos online. Lleva a WhatsApp o Instagram si están cargados en config/sitio.ts; si no hay ninguno, queda
 * solo el aviso. No usa el respaldo: el backend rechazaría esos turnos.
 */
export function SinTurnosOnline() {
  const whatsapp = whatsappUrl(`¡Hola ${negocio.nombre}! Quiero consultar por un turno.`);
  const instagram = instagramUrl();
  const arroba = instagramArroba();
  const hayContacto = whatsapp !== null || (instagram !== null && arroba !== null);

  return (
    <div className="aviso aviso--info sin-turnos">
      <Icono nombre="reloj" />
      <div className="aviso__cuerpo">
        <p className="sin-turnos__titulo">Por ahora no estamos tomando turnos online.</p>
        <p>
          {hayContacto
            ? 'Escribinos y coordinamos el servicio que necesitás.'
            : 'Estamos actualizando los servicios. Volvé a visitarnos en unos días.'}
        </p>
        {hayContacto && (
          <div className="contacto__botones">
            {whatsapp && (
              <a className="boton boton--primario" href={whatsapp} target="_blank" rel="noopener noreferrer">
                <Icono nombre="whatsapp" />
                Escribinos por WhatsApp
              </a>
            )}
            {instagram && arroba && (
              <a className="boton boton--secundario" href={instagram} target="_blank" rel="noopener noreferrer">
                <Icono nombre="instagram" />
                {arroba}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
