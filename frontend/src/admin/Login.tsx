import { useId, useState, type FormEvent } from 'react';
import { iniciarSesion } from '../api/admin';
import { ApiError } from '../api/client';
import type { UsuarioSesion } from '../api/contract-panel';
import { MarcoFilete } from '../components/Filete';
import { Icono } from '../components/Icono';
import { Logo } from '../components/Logo';

interface Props {
  aviso?: string;
  alIngresar: (usuario: UsuarioSesion) => void;
}

export function Login({ aviso, alIngresar }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verOlvido, setVerOlvido] = useState(false);
  const id = useId();

  const ingresar = async () => {
    if (email.trim() === '' || password === '') {
      setError('Completá tu email y tu contraseña.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      alIngresar(await iniciarSesion(email.trim(), password));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos iniciar sesión. Probá de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <main className="login">
      <div className="login__caja">
        <MarcoFilete tamano="chico" />
        <div className="login__contenido">
          <Logo tamano="grande" />
          <h1 className="login__titulo">Panel de turnos</h1>
          {aviso && !error && (
            <p className="login__aviso" role="status">
              {aviso}
            </p>
          )}
          <form
            className="login__form"
            noValidate
            onSubmit={(evento: FormEvent<HTMLFormElement>) => {
              evento.preventDefault();
              void ingresar();
            }}
          >
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={`${id}-email`}>
                Email
              </label>
              <input
                id={`${id}-email`}
                className="entrada"
                type="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(evento) => {
                  setEmail(evento.target.value);
                }}
              />
            </div>
            <div className="campo">
              <label className="campo__etiqueta" htmlFor={`${id}-password`}>
                Contraseña
              </label>
              <div className="login__password">
                <input
                  id={`${id}-password`}
                  className="entrada"
                  type={verPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(evento) => {
                    setPassword(evento.target.value);
                  }}
                />
                <button
                  type="button"
                  className="login__ver"
                  aria-pressed={verPassword}
                  onClick={() => {
                    setVerPassword((v) => !v);
                  }}
                >
                  <Icono nombre={verPassword ? 'ojoTachado' : 'ojo'} />
                  <span className="visualmente-oculto">Mostrar contraseña</span>
                </button>
              </div>
            </div>
            {error && (
              <p id={`${id}-error`} className="campo__error" role="alert">
                <Icono nombre="alerta" tamano={18} />
                {error}
              </p>
            )}
            <button type="submit" className="boton boton--primario boton--grande boton--bloque" disabled={enviando}>
              {enviando ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
          {/* No hay emails de recuperación: la contraseña nueva la asigna el superadmin desde Usuarios. */}
          <div className="login__olvido">
            <button
              type="button"
              className="login__olvido-boton"
              aria-expanded={verOlvido}
              aria-controls={`${id}-olvido`}
              onClick={() => {
                setVerOlvido((v) => !v);
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
            <p id={`${id}-olvido`} className="login__olvido-texto" hidden={!verOlvido}>
              Pedile al administrador del panel que te asigne una contraseña nueva.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
