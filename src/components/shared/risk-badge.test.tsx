import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskBadge } from './risk-badge';
import type { RiskLevel } from '@/lib/domain/types';

describe('RiskBadge', () => {
  it('mostra sempre un’etichetta testuale, non solo il colore', () => {
    const levels: RiskLevel[] = ['verde', 'giallo', 'arancione', 'rosso', 'grigio'];
    for (const level of levels) {
      const { unmount } = render(<RiskBadge risk={level} />);
      expect(screen.getByText(/./)).toBeInTheDocument();
      unmount();
    }
  });

  it('usa i messaggi previsti dal progetto', () => {
    render(<RiskBadge risk="verde" />);
    expect(screen.getByText('Obiettivo raggiungibile')).toBeInTheDocument();
  });

  it('non usa messaggi colpevolizzanti', () => {
    render(<RiskBadge risk="rosso" />);
    const text = screen.getByText('Piano a rischio').textContent ?? '';
    expect(text).not.toMatch(/colpa|pigro|dovevi/i);
  });

  it('accetta un’etichetta personalizzata', () => {
    render(<RiskBadge risk="giallo" label="Serve un piccolo aumento" />);
    expect(screen.getByText('Serve un piccolo aumento')).toBeInTheDocument();
  });
});
