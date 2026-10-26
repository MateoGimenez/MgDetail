import { useCatalogo } from './catalogo-contexto';
import { CabeceraSeccion } from './CabeceraSeccion';
import { Comparativa } from './Comparativa';
import { ListaTarjetas } from './ListaTarjetas';
import { useReserva } from './reserva-contexto';
import { SinTurnosOnline } from './SinTurnosOnline';
import { TarjetaServicio } from './TarjetaServicio';

const CANTIDADES = ['Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'];

/** La bajada cuenta los servicios que hay en el catálogo: "Cinco servicios, explicados…", "12 servicios, …". */
function bajada(n: number): string {
  const cierre = 'Si no sabés cuál te conviene, elegí el que más se parezca y lo charlamos.';
  if (n === 1) return 'Un servicio, explicado en criollo: para qué sirve, qué incluye y cuánto tarda. Si tenés dudas, lo charlamos.';
  return `${CANTIDADES[n - 2] ?? String(n)} servicios, explicados en criollo: para qué sirve cada uno, qué incluye y cuánto tarda. ${cierre}`;
}

export function Servicios() {
  const { reservar } = useReserva();
  const { servicios, estado } = useCatalogo();
  return (
    <section id="servicios" className="seccion servicios" aria-labelledby="servicios-titulo">
      <div className="contenedor">
        <CabeceraSeccion id="servicios-titulo" titulo="Qué le hacemos a tu vehículo">
          {estado !== 'vacio' && <p className="seccion__bajada">{bajada(servicios.length)}</p>}
        </CabeceraSeccion>
        {estado === 'vacio' ? (
          <SinTurnosOnline />
        ) : (
          <>
            <ListaTarjetas cantidad={servicios.length}>
              {servicios.map((servicio) => (
                <TarjetaServicio
                  key={servicio.id}
                  servicio={servicio}
                  precioCargando={estado === 'cargando'}
                  alReservar={() => {
                    reservar({ servicioId: servicio.id });
                  }}
                />
              ))}
            </ListaTarjetas>
            <Comparativa />
          </>
        )}
      </div>
    </section>
  );
}
