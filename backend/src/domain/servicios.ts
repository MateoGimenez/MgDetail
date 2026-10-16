/**
 * Catálogo de servicios del taller. Es la única fuente de verdad de los IDs:
 * se usa para validar los turnos y para dar nombres legibles en los logs.
 */

export const SERVICIO_IDS = [
  'lavado-basico',
  'lavado-premium',
  'pulido',
  'encerado',
  'restauracion-opticas',
] as const;

export type ServicioId = (typeof SERVICIO_IDS)[number];

// Tipado como Record<ServicioId, ...>: si se agrega un ID y falta su nombre, no compila.
const NOMBRES: Readonly<Record<ServicioId, string>> = {
  'lavado-basico': 'Lavado Básico',
  'lavado-premium': 'Lavado Premium',
  pulido: 'Pulido',
  encerado: 'Encerado',
  'restauracion-opticas': 'Restauración de ópticas',
};

export function nombreDeServicio(id: ServicioId): string {
  return NOMBRES[id];
}
