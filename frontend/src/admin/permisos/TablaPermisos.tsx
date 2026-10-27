import { Fragment } from 'react';
import type { Capacidad, NivelPermiso, Permisos, Rol } from '../../api/contract-panel';
import { Icono } from '../../components/Icono';
import { agruparPorGrupo, nombreDeRol, textoDeMatiz, TEXTO_NIVEL } from '../../lib/permisosRol';
import './permisos.css';

const ICONO: Readonly<Record<NivelPermiso, 'check' | 'cerrar' | 'menos'>> = { si: 'check', no: 'cerrar', parcial: 'menos' };

/** Sí / No / Parcial: icono y palabra juntos, y debajo el matiz de lo parcial. Nada depende del color. */
function Nivel({ capacidad, rol }: { capacidad: Capacidad; rol: Rol }) {
  const nivel = capacidad.roles[rol];
  const matiz = capacidad.matiz?.[rol];
  return (
    <>
      <span className={`perm-nivel perm-nivel--${nivel}`}>
        <Icono nombre={ICONO[nivel]} tamano={16} />
        {TEXTO_NIVEL[nivel]}
      </span>
      {nivel === 'parcial' && matiz && <span className="perm-matiz">{textoDeMatiz(matiz)}</span>}
    </>
  );
}

/** Los roles en el orden que manda el backend; si la matriz no los trae, no hay tabla. */
function rolesDe(permisos: Permisos) {
  return permisos.roles.map((r) => ({ id: r.id, nombre: nombreDeRol(permisos, r.id), descripcion: r.descripcion }));
}

/**
 * Qué puede hacer cada rol (GET /api/admin/permisos). Dos presentaciones del mismo dato:
 * - desde 720 px, una tabla: capacidades agrupadas en filas y una columna por rol;
 * - en el celular, apilada por rol: una tarjeta por rol con sus capacidades, sin scroll horizontal.
 */
export function TablaPermisos({ permisos }: { permisos: Permisos }) {
  const roles = rolesDe(permisos);
  const grupos = agruparPorGrupo(permisos.capacidades);

  return (
    <div className="permisos">
      <div className="perm-tabla-caja">
        <table className="perm-tabla">
          <caption className="visualmente-oculto">Qué puede hacer cada rol del panel</caption>
          <thead>
            <tr>
              <th scope="col">Capacidad</th>
              {roles.map((r) => (
                <th key={r.id} scope="col">
                  {r.nombre}
                </th>
              ))}
            </tr>
          </thead>
          {grupos.map((g) => (
            <tbody key={g.grupo}>
              <tr>
                <th scope="colgroup" colSpan={roles.length + 1} className="perm-tabla__grupo">
                  {g.grupo}
                </th>
              </tr>
              {g.capacidades.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.texto}</th>
                  {roles.map((r) => (
                    <td key={r.id}>
                      <Nivel capacidad={c} rol={r.id} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="perm-apilada">
        {roles.map((r) => (
          <section key={r.id} className="perm-rol" aria-labelledby={`perm-rol-${r.id}`}>
            <h3 id={`perm-rol-${r.id}`} className="perm-rol__titulo">
              {r.nombre}
            </h3>
            {r.descripcion && <p className="perm-rol__descripcion">{r.descripcion}</p>}
            {grupos.map((g) => (
              <Fragment key={g.grupo}>
                <h4 className="perm-rol__grupo">{g.grupo}</h4>
                <ul role="list" className="perm-rol__lista">
                  {g.capacidades.map((c) => (
                    <li key={c.id} className="perm-rol__item">
                      <Nivel capacidad={c} rol={r.id} />
                      <span className="perm-rol__texto">{c.texto}</span>
                    </li>
                  ))}
                </ul>
              </Fragment>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
