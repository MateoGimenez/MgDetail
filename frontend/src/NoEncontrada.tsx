import { Link } from 'react-router';
import { Logo } from './components/Logo';
import { SeparadorFilete } from './components/Filete';

export function NoEncontrada() {
  return (
    <main className="no-encontrada">
      <Logo tamano="grande" />
      <SeparadorFilete />
      <h1 className="no-encontrada__titulo">Esta página no existe</h1>
      <p className="no-encontrada__texto">Puede que el enlace esté mal escrito o que la página se haya movido.</p>
      <Link className="boton boton--primario" to="/">
        Ir al inicio
      </Link>
    </main>
  );
}
