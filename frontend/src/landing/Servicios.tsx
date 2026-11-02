import { VEHICULO_PLURAL, type VehiculoTipo } from '../api/contract';
import { serviciosPara } from '../lib/precios';
import { useCatalogo } from './catalogo-contexto';
import { CabeceraSeccion } from './CabeceraSeccion';
import { ListaTarjetas } from './ListaTarjetas';
import { useReserva } from './reserva-contexto';
import { SelectorVehiculo } from './SelectorVehiculo';
import { SinServiciosParaVehiculo } from './SinServiciosParaVehiculo';
import { SinTurnosOnline } from './SinTurnosOnline';
import { TarjetaServicio } from './TarjetaServicio';

const CANTIDADES = ['Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'];

/** La bajada cuenta los servicios que hay en el catálogo: "Cinco servicios, explicados…", "12 servicios, …". */
function bajada(n: number, vehiculo: VehiculoTipo): string {
  const para = VEHICULO_PLURAL[vehiculo];
  const cierre = 'Si tenés dudas, elegí el que más se parezca y lo charlamos.';
  if (n === 1) return `Un servicio para ${para}, explicado en criollo: para qué sirve, qué incluye y cuánto tarda. Si tenés dudas, lo charlamos.`;
  return `${CANTIDADES[n - 2] ?? String(n)} servicios para ${para}, explicados en criollo: para qué sirve cada uno, qué incluye y cuánto tarda. ${cierre}`;
}

export function Servicios() {
  const { reservar, vehiculo } = useReserva();
  const { servicios: todos, estado } = useCatalogo();
  // Solo los servicios que se ofrecen para el vehículo elegido.
  const servicios = serviciosPara(todos, vehiculo);
  return (
    <section id="servicios" className="seccion servicios" aria-labelledby="servicios-titulo">
      <div className="contenedor">
        <CabeceraSeccion id="servicios-titulo" titulo="Qué le hacemos a tu vehículo">
          {estado !== 'vacio' && <p className="seccion__bajada">{servicios.length > 0 ? bajada(servicios.length, vehiculo) : 'Elegí tu vehículo y mirá qué le hacemos.'}</p>}
          {estado !== 'vacio' && <SelectorVehiculo cantidad={servicios.length} />}
        </CabeceraSeccion>
        {estado === 'vacio' ? (
          <SinTurnosOnline />
        ) : servicios.length === 0 ? (
          <div key={vehiculo} className="servicios__cambio">
            <SinServiciosParaVehiculo vehiculo={vehiculo} />
          </div>
        ) : (
          <div key={vehiculo} className="servicios__cambio">
          <ListaTarjetas cantidad={servicios.length}>
            {servicios.map((servicio) => (
              <TarjetaServicio
                key={servicio.id}
                servicio={servicio}
                vehiculo={vehiculo}
                precioCargando={estado === 'cargando'}
                alReservar={() => {
                  reservar({ servicioId: servicio.id, vehiculoTipo: vehiculo });
                }}
              />
            ))}
          </ListaTarjetas>
          </div>
        )}
      </div>
    </section>
  );
}
