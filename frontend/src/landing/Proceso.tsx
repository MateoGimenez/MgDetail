import { whatsappUrl } from '../config/enlaces';
import { CabeceraSeccion } from './CabeceraSeccion';
import { revelar } from './useRevelar';

export function Proceso() {
  const conWhatsapp = whatsappUrl() !== null;

  const pasos = [
    {
      titulo: 'Pedís tu turno',
      texto: conWhatsapp
        ? 'Completás el formulario o nos escribís por WhatsApp. Elegís el servicio, el día y si te queda mejor a la mañana o a la tarde.'
        : 'Completás el formulario de esta página: elegís el servicio, el día y si te queda mejor a la mañana o a la tarde.',
    },
    {
      titulo: 'Te confirmamos',
      texto: 'Te contactamos para confirmar el día y el horario. Si tenés dudas sobre qué servicio conviene, lo charlamos.',
    },
    {
      titulo: 'Miramos tu vehículo con vos',
      texto:
        'Antes de empezar revisamos juntos la pintura, el interior y las ópticas, y te decimos qué se puede lograr y qué no.',
    },
    {
      titulo: 'Hacemos el trabajo',
      texto: 'Sin apuro y con el producto indicado para cada superficie: pintura, plásticos, tapizados, vidrios y llantas.',
    },
    {
      titulo: 'Te lo entregamos',
      texto: 'Te mostramos el resultado y te contamos cómo cuidarlo para que te dure más.',
    },
  ];

  return (
    <section id="como-trabajamos" className="seccion proceso" aria-labelledby="proceso-titulo">
      <div className="contenedor proceso__grilla">
        <CabeceraSeccion id="proceso-titulo" titulo="Cómo trabajamos" className="proceso__cabecera">
          <p className="seccion__bajada">
            Del pedido a la entrega, sin sorpresas: siempre sabés qué le vamos a hacer a tu vehículo y por qué.
          </p>
        </CabeceraSeccion>
        <ol className="pasos" role="list">
          {pasos.map((paso, indice) => (
            <li key={paso.titulo} ref={revelar} className="paso revelar revelar--sutil">
              <span className="paso__numero" aria-hidden="true">
                {indice + 1}
              </span>
              <div className="paso__cuerpo">
                <h3 className="paso__titulo">
                  <span className="visualmente-oculto">Paso {indice + 1}: </span>
                  {paso.titulo}
                </h3>
                <p className="paso__texto">{paso.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
