import { useId } from 'react';
import type { Permisos, Rol } from '../../api/contract-panel';
import { Icono } from '../../components/Icono';
import { resumenDeRol, textoDeMatiz, type ItemDePermiso } from '../../lib/permisosRol';
import './permisos.css';

interface Props {
  permisos: Permisos;
  rol: Rol;
  /** "tu": "Podés / No podés" (el diálogo "Tu rol"). "otra": "Va a poder / No va a poder" (al elegir el rol de alguien). */
  persona: 'tu' | 'otra';
  /** Nivel de los títulos (h3 por defecto). */
  nivel?: 3 | 4;
}

const TITULOS = {
  tu: { puede: 'Podés', noPuede: 'No podés' },
  otra: { puede: 'Va a poder', noPuede: 'No va a poder' },
} as const;

function Lista({ items, tipo }: { items: ItemDePermiso[]; tipo: 'si' | 'no' }) {
  return (
    <ul role="list" className="resumen-rol__lista">
      {items.map((item) => (
        <li key={item.texto} className={`resumen-rol__item resumen-rol__item--${tipo}`}>
          <Icono nombre={tipo === 'si' ? 'check' : 'cerrar'} tamano={16} className="resumen-rol__marca" />
          <span>
            {item.texto}
            {item.matiz && <span className="resumen-rol__matiz">Parcial: {textoDeMatiz(item.matiz)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Lo que puede y no puede un rol, armado desde la matriz del backend: lo parcial va entre lo que puede, con su matiz
 * en texto. Las marcas llevan ✓ / ✗ y además lo dicen los títulos: nada depende del color.
 */
export function ResumenDeRol({ permisos, rol, persona, nivel = 3 }: Props) {
  const id = useId();
  const resumen = resumenDeRol(permisos.capacidades, rol);
  const Titulo = nivel === 3 ? 'h3' : 'h4';
  const t = TITULOS[persona];
  return (
    <div className="resumen-rol">
      <section aria-labelledby={`${id}-puede`}>
        <Titulo id={`${id}-puede`} className="resumen-rol__titulo">
          {t.puede}
        </Titulo>
        {resumen.puede.length > 0 ? (
          <Lista items={resumen.puede} tipo="si" />
        ) : (
          <p className="resumen-rol__vacio">Nada por ahora.</p>
        )}
      </section>
      <section aria-labelledby={`${id}-no`}>
        <Titulo id={`${id}-no`} className="resumen-rol__titulo">
          {t.noPuede}
        </Titulo>
        {resumen.noPuede.length > 0 ? (
          <Lista items={resumen.noPuede} tipo="no" />
        ) : (
          <p className="resumen-rol__vacio">Puede todo lo que tiene el panel.</p>
        )}
      </section>
    </div>
  );
}

