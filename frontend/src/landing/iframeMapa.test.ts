import fuente from './DondeEstamos.tsx?raw';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

describe('iframe del mapa', () => {
  it('limita lo que recibe y lo que puede hacer Google', () => {
    expect(fuente).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(fuente).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"');
    expect(fuente).not.toContain('no-referrer-when-downgrade');
  });
});

describe('ErrorBoundary', () => {
  it('pasa a estado de falla cuando algo lanza', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ fallo: true });
  });
});
