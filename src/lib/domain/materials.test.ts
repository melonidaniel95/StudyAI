import { describe, expect, it } from 'vitest';
import {
  buildSegments,
  calibratePace,
  classifySegment,
  difficultyFactor,
  estimateMinutes,
  resourceProgress,
  summarizeSegments,
  type OutlineEntry,
  type SegmentOptions,
} from './materials';

const baseOptions: SegmentOptions = {
  pageCount: 60,
  minutesPerPage: 2,
  minutesPerPageExercises: 5,
  maxSessionMinutes: 120,
  minSessionMinutes: 25,
  fallbackTitle: 'Elettronica L3',
  difficulty: 3,
};

describe('classifySegment', () => {
  it('riconosce le parti di esercizi', () => {
    expect(classifySegment('Esercizi sulla giunzione PN')).toBe('esercizi');
    expect(classifySegment('Esercitazione 2')).toBe('esercizi');
  });

  it('riconosce le parti non studiabili', () => {
    expect(classifySegment('Bibliografia')).toBe('riferimento');
    expect(classifySegment('Indice')).toBe('riferimento');
  });

  it('tutto il resto è teoria', () => {
    expect(classifySegment('Giunzione PN')).toBe('teoria');
  });
});

describe('difficultyFactor', () => {
  it('cresce con la difficoltà', () => {
    expect(difficultyFactor(1)).toBeLessThan(difficultyFactor(3));
    expect(difficultyFactor(3)).toBeLessThan(difficultyFactor(5));
    expect(difficultyFactor(3)).toBeCloseTo(1.05, 2);
  });

  it('resta nei limiti anche con valori fuori scala', () => {
    expect(difficultyFactor(0)).toBe(difficultyFactor(1));
    expect(difficultyFactor(99)).toBe(difficultyFactor(5));
  });
});

describe('estimateMinutes', () => {
  it('cresce con le pagine', () => {
    expect(estimateMinutes(40, 2)).toBeGreaterThan(estimateMinutes(20, 2));
  });

  it('gli esercizi costano più della teoria', () => {
    expect(estimateMinutes(10, 2, 'esercizi', 3, 5)).toBeGreaterThan(
      estimateMinutes(10, 2, 'teoria', 3, 5),
    );
  });

  it('le parti di riferimento non occupano tempo', () => {
    expect(estimateMinutes(10, 2, 'riferimento')).toBe(0);
  });

  it('vale 0 senza pagine', () => {
    expect(estimateMinutes(0, 2)).toBe(0);
  });
});

describe('buildSegments — con indice', () => {
  const outline: OutlineEntry[] = [
    { title: 'Semiconduttori', page: 1, level: 0 },
    { title: 'Giunzione PN', page: 15, level: 0 },
    { title: 'Regione di svuotamento', page: 18, level: 1 },
    { title: 'Esercizi', page: 45, level: 0 },
  ];

  it('crea un segmento per ogni voce di primo livello', () => {
    const segments = buildSegments(outline, baseOptions);
    expect(segments.length).toBeGreaterThanOrEqual(3);
    expect(segments[0]?.title).toBe('Semiconduttori');
  });

  it('copre tutte le pagine senza sovrapposizioni né buchi', () => {
    const segments = buildSegments(outline, baseOptions);
    expect(segments[0]?.pageStart).toBe(1);
    expect(segments[segments.length - 1]?.pageEnd).toBe(60);
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i]?.pageStart).toBe((segments[i - 1]?.pageEnd ?? 0) + 1);
    }
  });

  it('applica il ritmo degli esercizi alla parte di esercizi', () => {
    const segments = buildSegments(outline, baseOptions);
    const esercizi = segments.filter((segment) => segment.kind === 'esercizi');
    expect(esercizi.length).toBeGreaterThan(0);
    const pagine = esercizi.reduce((sum, s) => sum + s.pageCount, 0);
    const minuti = esercizi.reduce((sum, s) => sum + s.estimatedMinutes, 0);
    expect(minuti / pagine).toBeGreaterThan(2);
  });

  it('ignora le voci annidate come segmenti autonomi', () => {
    const segments = buildSegments(outline, baseOptions);
    expect(segments.some((segment) => segment.title === 'Regione di svuotamento')).toBe(false);
  });
});

describe('buildSegments — senza indice', () => {
  it('crea blocchi dimensionati sulla sessione massima', () => {
    const segments = buildSegments([], { ...baseOptions, pageCount: 120 });
    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      expect(segment.estimatedMinutes).toBeLessThanOrEqual(baseOptions.maxSessionMinutes);
    }
  });

  it('usa il nome del file come titolo', () => {
    const segments = buildSegments([], { ...baseOptions, pageCount: 30 });
    expect(segments[0]?.title).toContain('Elettronica L3');
  });

  it('copre esattamente tutte le pagine', () => {
    const segments = buildSegments([], { ...baseOptions, pageCount: 137 });
    expect(segments[0]?.pageStart).toBe(1);
    expect(segments[segments.length - 1]?.pageEnd).toBe(137);
    const totale = segments.reduce((sum, s) => sum + s.pageCount, 0);
    expect(totale).toBe(137);
  });

  it('restituisce un elenco vuoto per un documento vuoto', () => {
    expect(buildSegments([], { ...baseOptions, pageCount: 0 })).toEqual([]);
  });
});

describe('buildSegments — dimensione delle sessioni', () => {
  it('spezza i capitoli troppo lunghi', () => {
    const outline: OutlineEntry[] = [
      { title: 'Capitolo lungo', page: 1, level: 0 },
      { title: 'Fine', page: 400, level: 0 },
    ];
    const segments = buildSegments(outline, { ...baseOptions, pageCount: 420 });
    const parti = segments.filter((segment) => segment.title.startsWith('Capitolo lungo'));
    expect(parti.length).toBeGreaterThan(1);
    expect(parti[0]?.title).toMatch(/\(1\/\d+\)/);
    for (const parte of parti) {
      expect(parte.estimatedMinutes).toBeLessThanOrEqual(baseOptions.maxSessionMinutes);
    }
  });

  it('unisce i capitoli troppo corti', () => {
    const outline: OutlineEntry[] = [
      { title: 'Intro A', page: 1, level: 0 },
      { title: 'Intro B', page: 3, level: 0 },
      { title: 'Intro C', page: 5, level: 0 },
      { title: 'Corpo', page: 7, level: 0 },
    ];
    const segments = buildSegments(outline, { ...baseOptions, pageCount: 60 });
    expect(segments.length).toBeLessThan(4);
    expect(segments[0]?.title).toContain('+');
  });
});

describe('summarizeSegments', () => {
  it('somma pagine e minuti di più file', () => {
    const a = buildSegments([], { ...baseOptions, pageCount: 40, fallbackTitle: 'L1' });
    const b = buildSegments([], { ...baseOptions, pageCount: 60, fallbackTitle: 'L2' });
    const summary = summarizeSegments([a, b]);
    expect(summary.files).toBe(2);
    expect(summary.pages).toBe(100);
    expect(summary.minutes).toBeGreaterThan(0);
  });
});

describe('calibratePace', () => {
  const oggi = '2026-08-06';

  it('non modifica il ritmo con meno di 3 misurazioni', () => {
    const result = calibratePace(2, [
      { pages: 20, minutes: 60, date: oggi },
      { pages: 10, minutes: 30, date: oggi },
    ]);
    expect(result.minutesPerPage).toBe(2);
    expect(result.confidence).toBe(0);
    expect(result.explanation).toContain('almeno 3 sessioni');
  });

  it('rallenta il ritmo se ci metti più del previsto', () => {
    const result = calibratePace(2, [
      { pages: 10, minutes: 40, date: '2026-08-01' },
      { pages: 10, minutes: 42, date: '2026-08-03' },
      { pages: 10, minutes: 38, date: '2026-08-05' },
    ]);
    expect(result.minutesPerPage).toBeGreaterThan(2);
    expect(result.explanation).toContain('meno pagine');
  });

  it('accelera il ritmo se sei più veloce', () => {
    const result = calibratePace(4, [
      { pages: 20, minutes: 40, date: '2026-08-01' },
      { pages: 20, minutes: 38, date: '2026-08-03' },
      { pages: 20, minutes: 42, date: '2026-08-05' },
    ]);
    expect(result.minutesPerPage).toBeLessThan(4);
    expect(result.explanation).toContain('più pagine');
  });

  it('non si sposta di più del 40% in una volta sola', () => {
    const result = calibratePace(2, [
      { pages: 1, minutes: 90, date: '2026-08-01' },
      { pages: 1, minutes: 95, date: '2026-08-03' },
      { pages: 1, minutes: 88, date: '2026-08-05' },
    ]);
    expect(result.minutesPerPage).toBeLessThanOrEqual(2.8);
  });

  it('resta sempre entro limiti sensati', () => {
    const result = calibratePace(0.3, [
      { pages: 1000, minutes: 1, date: '2026-08-01' },
      { pages: 1000, minutes: 1, date: '2026-08-03' },
      { pages: 1000, minutes: 1, date: '2026-08-05' },
    ]);
    expect(result.minutesPerPage).toBeGreaterThanOrEqual(0.2);
  });

  it('la fiducia cresce con il numero di misurazioni', () => {
    const poche = calibratePace(2, [
      { pages: 10, minutes: 20, date: oggi },
      { pages: 10, minutes: 20, date: oggi },
      { pages: 10, minutes: 20, date: oggi },
    ]);
    const molte = calibratePace(
      2,
      Array.from({ length: 12 }, () => ({ pages: 10, minutes: 20, date: oggi })),
    );
    expect(molte.confidence).toBeGreaterThan(poche.confidence);
    expect(molte.confidence).toBe(1);
  });
});

describe('resourceProgress', () => {
  it('misura l’avanzamento in pagine, non in file aperti', () => {
    expect(
      resourceProgress([
        { pageCount: 30, pagesDone: 30 },
        { pageCount: 30, pagesDone: 0 },
      ]),
    ).toBe(0.5);
  });

  it('non supera il 100% anche con pagine in eccesso', () => {
    expect(resourceProgress([{ pageCount: 10, pagesDone: 40 }])).toBe(1);
  });

  it('vale 0 senza segmenti', () => {
    expect(resourceProgress([])).toBe(0);
  });
});
