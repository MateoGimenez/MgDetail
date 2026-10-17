import { Rombo, SeparadorFilete } from '../components/Filete';
import { MonogramaGiratorio } from './MonogramaGiratorio';
import { whatsappUrl } from '../config/enlaces';
import { negocio } from '../config/sitio';

export function Beneficios() {
  const conWhatsapp = whatsappUrl() !== null;

  const beneficios = [
    {
      titulo: 'Te explicamos todo',
      texto: 'Sin palabras raras: antes de empezar sabés qué le vamos a hacer a tu vehículo y por qué.',
    },
    {
      titulo: 'Te decimos la verdad',
      texto: 'Si una raya no sale con un pulido, te lo decimos antes. Preferimos que sepas qué esperar.',
    },
    {
      titulo: 'Cuidamos la pintura',
      texto: 'Lavado a mano, método de dos baldes y secado con microfibra, para no rayar lo que vinimos a cuidar.',
    },
    {
      titulo: 'Autos, camionetas y motos',
      texto: 'Cada vehículo tiene lo suyo, y adaptamos el trabajo a lo que traés.',
    },
    {
      titulo: `Pensado para ${negocio.ciudad}`,
      texto: 'Acá el sol pega fuerte y la tierra se mete en todos lados: por eso, además de limpiar, protegemos.',
    },
    {
      titulo: 'Turno sin vueltas',
      texto: conWhatsapp
        ? 'Lo pedís online en un minuto o nos escribís por WhatsApp.'
        : 'Lo pedís online en un minuto, desde el celular.',
    },
  ];

  return (
    <section className="seccion beneficios" aria-labelledby="beneficios-titulo">
      <div className="contenedor">
        <header className="seccion__cabecera">
          <h2 id="beneficios-titulo" className="seccion__titulo">
            Por qué elegirnos
          </h2>
          <p className="seccion__bajada">
            Somos un taller nuevo y lo decimos de frente: todavía no tenemos cifras para mostrarte. Tenemos un método y
            la costumbre de explicar cada paso.
          </p>
        </header>
        <ul className="beneficios__lista" role="list">
          {beneficios.map((beneficio) => (
            <li key={beneficio.titulo} className="beneficio">
              <Rombo className="beneficio__marca" />
              <div>
                <h3 className="beneficio__titulo">{beneficio.titulo}</h3>
                <p className="beneficio__texto">{beneficio.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Momento de marca: el monograma 3D animado y la frase en cursiva cromada. */
export function Frase() {
  return (
    <div className="frase">
      <SeparadorFilete />
      <div className="frase__cuerpo">
        <MonogramaGiratorio />
        <p className="frase__texto">
          <span className="cromo">Lo bueno se hace con tiempo.</span>
        </p>
      </div>
      <SeparadorFilete className="separador--invertido" />
    </div>
  );
}
