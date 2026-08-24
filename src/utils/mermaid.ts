const FLOWCHART_TYPES = new Set(['graph', 'flowchart']);

const DIAGRAM_TYPE_RE =
  /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline)\b/;

const LABEL_NEEDS_QUOTES_RE = /[/<>(){}|&*#@!?=+,;:'"\\]/;

function firstDiagramLine(chart: string): string | null {
  for (const line of chart.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;
    return trimmed;
  }
  return null;
}

function getDiagramType(chart: string): string | null {
  const first = firstDiagramLine(chart);
  if (!first) return null;
  const match = first.match(DIAGRAM_TYPE_RE);
  return match ? match[1] : null;
}

function isFlowchart(chart: string): boolean {
  const type = getDiagramType(chart);
  if (type) return FLOWCHART_TYPES.has(type);
  // LLM sometimes omits the header but still emits flowchart node syntax.
  return /\b[A-Za-z][\w-]*\[[^\]]+\]/.test(chart);
}

function quoteFlowchartLabels(chart: string): string {
  return chart.replace(
    /(\b[A-Za-z][\w-]*)\[([^\]\n]+)\]/g,
    (match, nodeId: string, rawLabel: string) => {
      const label = rawLabel.trim();
      if (
        (label.startsWith('"') && label.endsWith('"')) ||
        (label.startsWith("'") && label.endsWith("'"))
      ) {
        return match;
      }
      if (!LABEL_NEEDS_QUOTES_RE.test(label)) {
        return match;
      }
      const escaped = label.replace(/"/g, '#quot;');
      return `${nodeId}["${escaped}"]`;
    },
  );
}

/**
 * Repair common LLM Mermaid mistakes before rendering.
 *
 * Flowcharts must not use sequence-diagram arrows (`->>`, `-->>`): the extra
 * `>` is tokenized as TAGEND and mermaid throws a parse error.
 */
export function preprocessMermaidChart(chart: string): string {
  let processed = chart.replace(/\r\n/g, '\n').trim();
  processed = processed.replace(/^```(?:mermaid)?\s*/i, '').replace(/\s*```$/i, '');
  processed = processed.replace(/mermaid version [0-9.]+/g, '');
  processed = processed.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  if (!isFlowchart(processed)) {
    return processed;
  }

  if (!getDiagramType(processed)) {
    processed = `graph TD\n${processed}`;
  }

  // Sequence-style arrows accidentally used in flowcharts.
  processed = processed.replace(/-->>/g, '-->');
  processed = processed.replace(/->>/g, '-->');

  processed = quoteFlowchartLabels(processed);
  return processed;
}
