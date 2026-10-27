import { describe, expect, it } from 'vitest';
import { avisoDeCambio, avisoDeEliminacion } from './avisosTurno';

const lucia = { nombre: '  Lucía Fernández ' };

describe('aviso al guardar un turno', () => {
  it('cada estado dice lo que hiciste', () => {
    expect(avisoDeCambio(lucia, { estado: 'confirmado' })).toBe('Confirmaste el turno de Lucía.');
    expect(avisoDeCambio(lucia, { estado: 'completado' })).toBe('Marcaste como completado el turno de Lucía.');
    expect(avisoDeCambio(lucia, { estado: 'cancelado' })).toBe('Cancelaste el turno de Lucía.');
    expect(avisoDeCambio(lucia, { estado: 'pendiente' })).toBe('El turno de Lucía volvió a pendiente.');
  });

  it('confirmar con otra fecha sigue siendo confirmar', () => {
    expect(avisoDeCambio(lucia, { estado: 'confirmado', fechaConfirmada: '2026-10-30', franjaConfirmada: 'tarde' })).toBe(
      'Confirmaste el turno de Lucía.',
    );
  });

  it('solo fecha: reprogramar; solo nota: guardada o borrada', () => {
    expect(avisoDeCambio(lucia, { fechaConfirmada: '2026-10-30', franjaConfirmada: 'tarde' })).toBe('Reprogramaste el turno de Lucía.');
    expect(avisoDeCambio(lucia, { notasInternas: 'Trae llave' })).toBe('Nota guardada.');
    expect(avisoDeCambio(lucia, { notasInternas: null })).toBe('Nota borrada.');
  });

  it('completar con cobro dice cuánto; solo cobro: guardado o quitado', () => {
    expect(avisoDeCambio(lucia, { estado: 'completado', monto: 60000, trabajadorId: 'u1' })).toBe(
      'Marcaste como completado el turno de Lucía. Cobrado $ 60.000.',
    );
    expect(avisoDeCambio(lucia, { estado: 'completado', trabajadorId: 'u1' })).toBe('Marcaste como completado el turno de Lucía.');
    expect(avisoDeCambio(lucia, { monto: 5000 })).toBe('Guardaste el cobro del turno de Lucía.');
    expect(avisoDeCambio(lucia, { trabajadorId: null })).toBe('Guardaste el cobro del turno de Lucía.');
    expect(avisoDeCambio(lucia, { monto: null })).toBe('Quitaste el cobro del turno de Lucía.');
  });

  it('eliminar', () => {
    expect(avisoDeEliminacion(lucia)).toBe('Eliminaste la solicitud de Lucía.');
  });
});
