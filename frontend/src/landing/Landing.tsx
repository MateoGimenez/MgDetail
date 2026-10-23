import { SeparadorFilete } from '../components/Filete';
import { Beneficios, Frase } from './Beneficios';
import { Cabecera } from './Cabecera';
import { Contacto } from './Contacto';
import { Hero } from './Hero';
import { Pie } from './Pie';
import { Preguntas } from './Preguntas';
import { Proceso } from './Proceso';
import { Reserva } from './Reserva';
import { CatalogoProvider } from './CatalogoProvider';
import { ReservaProvider } from './ReservaProvider';
import { Servicios } from './Servicios';
import { Trabajos } from './Trabajos';
import './landing.css';

export function Landing() {
  return (
    <CatalogoProvider>
      <ReservaProvider>
        <div className="landing">
          <div className="reflejo" aria-hidden="true" />
          <Cabecera />
          <main id="contenido" tabIndex={-1}>
            <Hero />
            <Servicios />
            <SeparadorFilete />
            <Proceso />
            <Trabajos />
            <Beneficios />
            <Frase />
            <Preguntas />
            <Reserva />
            <Contacto />
          </main>
          <Pie />
        </div>
      </ReservaProvider>
    </CatalogoProvider>
  );
}
