import { SeparadorFilete } from '../components/Filete';
import { MENSAJE_CONSULTA_TURNO } from '../config/enlaces';
import { Beneficios, Frase } from './Beneficios';
import { BotonWhatsapp } from './BotonWhatsapp';
import { Cabecera } from './Cabecera';
import { Contacto } from './Contacto';
import { DondeEstamos } from './DondeEstamos';
import { Hero } from './Hero';
import { Pie } from './Pie';
import { Preguntas } from './Preguntas';
import { Proceso } from './Proceso';
import { Reserva } from './Reserva';
import { CatalogoProvider } from './CatalogoProvider';
import { ReservaProvider } from './ReservaProvider';
import { Servicios } from './Servicios';
import { Trabajos } from './Trabajos';
import { useIrAlHash } from './useIrAlHash';
import { useMagnetico } from './useMagnetico';
import './landing.css';
import './servicios.css';
import './revelar.css';
import './donde.css';
import './efectos.css';

export function Landing() {
  useIrAlHash();
  useMagnetico();
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
            <DondeEstamos />
            <Contacto />
          </main>
          <Pie />
          <BotonWhatsapp mensaje={MENSAJE_CONSULTA_TURNO} />
        </div>
      </ReservaProvider>
    </CatalogoProvider>
  );
}
