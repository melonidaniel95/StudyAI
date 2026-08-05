'use client';

import { useMemo } from 'react';
import type { ExamStatus } from '@/lib/domain/types';

interface GraphExam {
  id: string;
  label: string;
  status: ExamStatus;
}

interface GraphDependency {
  id: string;
  examId: string;
  dependsOnExamId: string;
  strength: string;
}

const NODE_WIDTH = 168;
const NODE_HEIGHT = 44;
const COLUMN_GAP = 90;
const ROW_GAP = 18;

/**
 * Grafo dei prerequisiti disposto per livelli: a sinistra gli esami che non
 * dipendono da nessuno, a destra quelli che ne richiedono altri.
 * L'SVG ha una descrizione testuale alternativa per l'accessibilità.
 */
export function DependencyGraph({
  exams,
  dependencies,
}: {
  exams: GraphExam[];
  dependencies: GraphDependency[];
}) {
  const layout = useMemo(() => {
    const depth = new Map<string, number>();
    const parents = new Map<string, string[]>();
    for (const exam of exams) parents.set(exam.id, []);
    for (const dependency of dependencies) {
      const list = parents.get(dependency.examId);
      if (list) list.push(dependency.dependsOnExamId);
    }

    const resolve = (id: string, seen: Set<string>): number => {
      if (depth.has(id)) return depth.get(id) ?? 0;
      if (seen.has(id)) return 0;
      seen.add(id);
      const list = parents.get(id) ?? [];
      const value = list.length === 0 ? 0 : Math.max(...list.map((p) => resolve(p, seen) + 1));
      depth.set(id, value);
      return value;
    };

    for (const exam of exams) resolve(exam.id, new Set());

    const columns = new Map<number, GraphExam[]>();
    for (const exam of exams) {
      const level = depth.get(exam.id) ?? 0;
      const list = columns.get(level) ?? [];
      list.push(exam);
      columns.set(level, list);
    }

    const positions = new Map<string, { x: number; y: number }>();
    let maxRows = 0;
    for (const [level, list] of columns) {
      maxRows = Math.max(maxRows, list.length);
      list.forEach((exam, index) => {
        positions.set(exam.id, {
          x: level * (NODE_WIDTH + COLUMN_GAP) + 10,
          y: index * (NODE_HEIGHT + ROW_GAP) + 10,
        });
      });
    }

    const width = (Math.max(...columns.keys(), 0) + 1) * (NODE_WIDTH + COLUMN_GAP) + 20;
    const height = maxRows * (NODE_HEIGHT + ROW_GAP) + 20;
    return { positions, width, height };
  }, [exams, dependencies]);

  const labelById = new Map(exams.map((exam) => [exam.id, exam.label]));

  if (exams.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessun esame da rappresentare.</p>;
  }

  const description =
    dependencies.length === 0
      ? 'Nessun prerequisito impostato tra gli esami.'
      : dependencies
          .map(
            (dependency) =>
              `${labelById.get(dependency.dependsOnExamId) ?? '?'} è prerequisito di ${labelById.get(dependency.examId) ?? '?'}`,
          )
          .join('; ');

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card p-2">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          role="img"
          aria-label="Grafo dei prerequisiti tra esami"
          aria-describedby="descrizione-grafo"
          className="max-w-none"
        >
          <defs>
            <marker id="freccia" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="hsl(var(--muted-foreground))" />
            </marker>
          </defs>
          {dependencies.map((dependency) => {
            const from = layout.positions.get(dependency.dependsOnExamId);
            const to = layout.positions.get(dependency.examId);
            if (!from || !to) return null;
            const x1 = from.x + NODE_WIDTH;
            const y1 = from.y + NODE_HEIGHT / 2;
            const x2 = to.x - 4;
            const y2 = to.y + NODE_HEIGHT / 2;
            const midX = (x1 + x2) / 2;
            return (
              <path
                key={dependency.id}
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={dependency.strength === 'forte' ? 1.6 : 1}
                strokeDasharray={dependency.strength === 'forte' ? undefined : '4 3'}
                markerEnd="url(#freccia)"
                opacity={0.7}
              />
            );
          })}
          {exams.map((exam) => {
            const position = layout.positions.get(exam.id);
            if (!position) return null;
            const passed = exam.status === 'superato';
            return (
              <g key={exam.id} transform={`translate(${position.x}, ${position.y})`}>
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={8}
                  fill={passed ? 'hsl(var(--risk-green) / 0.15)' : 'hsl(var(--secondary))'}
                  stroke="hsl(var(--border))"
                />
                <text
                  x={NODE_WIDTH / 2}
                  y={NODE_HEIGHT / 2 + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fill="hsl(var(--foreground))"
                >
                  {exam.label.length > 24 ? `${exam.label.slice(0, 23)}…` : exam.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p id="descrizione-grafo" className="text-xs text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
