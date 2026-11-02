import { VEHICULO_PLURAL, type VehiculoTipo } from '../api/contract';
import { Icono } from '../components/Icono';
import { whatsappUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';

/**
 * El catálogo tiene servicios, pero ninguno para el tipo de vehículo elegido. Es un estado esperable (el dueño puede
 * ofrecer un servicio solo para autos), no un error: lo dice con calidez y deja el WhatsApp para consultar.
 */
export function SinServiciosParaVehiculo({ vehiculo }: { vehiculo: VehiculoTipo }) {
  const plural = VEHICULO_PLURAL[vehiculo];
  const whatsapp = whatsappUrl(`¡Hola ${negocio.nombre}! Tengo ${vehiculo === 'auto' ? 'un auto' : vehiculo === 'moto' ? 'una moto' : 'una camioneta'} y quiero consultar qué servicios me pueden hacer.`);
  return (
    <div className="aviso aviso--info sin-turnos">
      <Icono nombre="reloj" />
      <div className="aviso__cuerpo">
        <p className="sin-turnos__titulo">Todavía no tenemos servicios cargados para {plural}.</p>
        <p>
          {whatsapp
            ? 'Escribinos y lo charlamos: seguro encontramos qué hacerle. Si tenés otro vehículo, cambialo arriba para ver sus servicios.'
            : 'Si tenés otro vehículo, cambialo arriba para ver sus servicios.'}
        </p>
        {whatsapp && (
          <div className="contacto__botones">
            <a className="boton boton--primario" href={whatsapp} target="_blank" rel="noopener noreferrer">
              <Icono nombre="whatsapp" />
              Escribinos por WhatsApp
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
