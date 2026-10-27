import { ETIQUETA_ROL, ROLES, type Capacidad, type NivelPermiso, type Permisos, type Rol } from '../api/contract-panel';

/**
 * La matriz de permisos por rol (GET /api/admin/permisos) en funciones puras. El backend es la única fuente de
 * verdad: acá solo se agrupa y se redacta lo que manda.
 */

export interface GrupoDeCapacidades {
  grupo: string;
  capacidades: Capacidad[];
}

/** Agrupa por `grupo` en el orden en que aparece cada uno (el que decidió el backend). */
export function agruparPorGrupo(capacidades: readonly Capacidad[]): GrupoDeCapacidades[] {
  const grupos: GrupoDeCapacidades[] = [];
  for (const capacidad of capacidades) {
    const existente = grupos.find((g) => g.grupo === capacidad.grupo);
    if (existente) existente.capacidades.push(capacidad);
    else grupos.push({ grupo: capacidad.grupo, capacidades: [capacidad] });
  }
  return grupos;
}

export const TEXTO_NIVEL: Readonly<Record<NivelPermiso, string>> = { si: 'Sí', no: 'No', parcial: 'Parcial' };

/** Lo que dice un lector de pantalla de una celda: "Sí", "No", "Parcial: solo puede marcarlos como Completado". */
export function textoDeCelda(capacidad: Capacidad, rol: Rol): string {
  const nivel = capacidad.roles[rol];
  const matiz = capacidad.matiz?.[rol];
  return nivel === 'parcial' && matiz ? `${TEXTO_NIVEL[nivel]}: ${minuscula(matiz)}` : TEXTO_NIVEL[nivel];
}

export interface ItemDePermiso {
  texto: string;
  /** Solo en lo parcial: hasta dónde llega. */
  matiz: string | null;
}

export interface ResumenDeRol {
  rol: Rol;
  puede: ItemDePermiso[];
  noPuede: ItemDePermiso[];
}

/**
 * Lo que puede y no puede un rol, en el orden de la matriz. Lo parcial va entre lo que puede, con su matiz (si el
 * backend no mandó uno, queda sin matiz y se muestra tal cual).
 */
export function resumenDeRol(capacidades: readonly Capacidad[], rol: Rol): ResumenDeRol {
  const puede: ItemDePermiso[] = [];
  const noPuede: ItemDePermiso[] = [];
  for (const capacidad of capacidades) {
    const nivel = capacidad.roles[rol];
    if (nivel === 'no') noPuede.push({ texto: capacidad.texto, matiz: null });
    else puede.push({ texto: capacidad.texto, matiz: nivel === 'parcial' ? (capacidad.matiz?.[rol] ?? null) : null });
  }
  return { rol, puede, noPuede };
}

/** El matiz como frase para ir debajo de la capacidad: "Solo puede marcarlos como Completado." → "solo puede marcarlos como Completado". */
export const textoDeMatiz = (matiz: string): string => minuscula(sinPunto(matiz));

/** Texto de un ítem para una lista: "Cambiar el estado de un turno (solo puede marcarlos como Completado)". */
export const textoDeItem = (item: ItemDePermiso): string =>
  item.matiz ? `${sinPunto(item.texto)} (${textoDeMatiz(item.matiz)})` : sinPunto(item.texto);

/** Datos de un rol dentro de la matriz, o null si el backend no lo mandó. */
export const rolDe = (permisos: Permisos, rol: Rol) => permisos.roles.find((r) => r.id === rol) ?? null;

/** Nombre legible de un rol, con respaldo local por si la matriz no lo trae. */
export const nombreDeRol = (permisos: Permisos | null, rol: Rol): string =>
  (permisos ? rolDe(permisos, rol)?.nombre : undefined) ?? ETIQUETA_ROL[rol];

export const ORDEN_DE_ROLES: readonly Rol[] = ROLES;

function minuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

function sinPunto(texto: string): string {
  return texto.trim().replace(/[.\s]+$/, '');
}

/** Frase corta para anunciar al elegir un rol: "Rol Empleado: puede 6 cosas y no puede 5 cosas." */
export function frasePorRol(permisos: Permisos, rol: Rol): string {
  const { puede, noPuede } = resumenDeRol(permisos.capacidades, rol);
  const cosas = (n: number) => (n === 1 ? '1 cosa' : `${String(n)} cosas`);
  return `Rol ${nombreDeRol(permisos, rol)}: puede ${cosas(puede.length)} y no puede ${cosas(noPuede.length)}.`;
}
