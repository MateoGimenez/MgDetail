import { useState } from 'react';
import { PASSWORD_MAXIMO } from '../api/contract-panel';
import { Icono } from '../components/Icono';

interface Props {
  id: string;
  valor: string;
  alCambiar: (valor: string) => void;
  /** id del mensaje de error, si hay. */
  idError?: string;
  idAyuda?: string;
  deshabilitado?: boolean;
}

/** Contraseña nueva de un usuario (la asigna el superadmin), con botón para mostrarla mientras se escribe. */
export function CampoPassword({ id, valor, alCambiar, idError, idAyuda, deshabilitado }: Props) {
  const [ver, setVer] = useState(false);
  const describe = [idAyuda, idError].filter(Boolean).join(' ');

  return (
    <div className="login__password">
      <input
        id={id}
        className="entrada"
        type={ver ? 'text' : 'password'}
        autoComplete="new-password"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={PASSWORD_MAXIMO}
        value={valor}
        disabled={deshabilitado}
        aria-invalid={idError ? true : undefined}
        aria-describedby={describe === '' ? undefined : describe}
        onChange={(evento) => {
          alCambiar(evento.target.value);
        }}
      />
      <button
        type="button"
        className="login__ver"
        aria-pressed={ver}
        onClick={() => {
          setVer((v) => !v);
        }}
      >
        <Icono nombre={ver ? 'ojoTachado' : 'ojo'} />
        <span className="visualmente-oculto">Mostrar contraseña</span>
      </button>
    </div>
  );
}
