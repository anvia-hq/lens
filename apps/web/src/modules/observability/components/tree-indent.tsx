import type { FlatSpanNode } from "../types";
import { ObservationGlyph } from "./observation-glyph";

export function TreeIndent({ row, collapsed }: { row: FlatSpanNode; collapsed: boolean }) {
  const slot = 20;
  const iconX = row.depth * slot;
  return (
    <span
      className="relative shrink-0"
      data-tree-depth={row.depth}
      style={{ width: `${(row.depth + 1) * slot + 4}px` }}
    >
      {row.ancestorContinues
        .map((continues, level) => ({
          continues,
          key: `${row.span.spanId}:ancestor:${level}`,
          left: level * slot + 10,
        }))
        .map((line) =>
          line.continues ? (
            <span
              className="absolute inset-y-0 w-px bg-border"
              data-tree-line="ancestor"
              key={line.key}
              style={{ left: `${line.left}px` }}
            />
          ) : null,
        )}
      {row.depth > 0 ? (
        row.isLastSibling ? (
          <span
            className="absolute top-0 h-1/2 rounded-bl-sm border-b border-l border-border"
            data-tree-line="elbow"
            style={{
              left: `${(row.depth - 1) * slot + 10}px`,
              width: `${slot}px`,
            }}
          />
        ) : (
          <>
            <span
              className="absolute inset-y-0 w-px bg-border"
              data-tree-line="sibling-continuation"
              style={{ left: `${(row.depth - 1) * slot + 10}px` }}
            />
            <span
              className="absolute top-1/2 h-px bg-border"
              data-tree-line="elbow"
              style={{ left: `${(row.depth - 1) * slot + 10}px`, width: `${slot}px` }}
            />
          </>
        )
      ) : null}
      {row.hasChildren && !collapsed ? (
        <span
          className="absolute bottom-0 w-px bg-border"
          data-tree-line="children"
          style={{ left: `${iconX + 10}px`, top: "calc(50% + 0.5rem)" }}
        />
      ) : null}
      <span className="absolute top-1/2 -translate-y-1/2" style={{ left: `${iconX + 2}px` }}>
        <ObservationGlyph
          kind={row.span.observationKind}
          status={row.span.observationKind === "tool" ? undefined : row.span.status}
        />
      </span>
    </span>
  );
}
