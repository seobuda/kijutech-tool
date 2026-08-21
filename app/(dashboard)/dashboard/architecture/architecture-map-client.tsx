'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  FolderKanban,
  Sparkles,
  Brain,
  BookOpen,
  Target,
  Rocket,
  Flag,
  Stethoscope,
  Search,
  Map as MapIcon,
  Hammer,
  BarChart3,
  NotebookText,
  Circle,
  ArrowLeft,
  Play,
  Square,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SystemNode } from '@/lib/architecture-map/registry';
import type { ProcessStep } from '@/lib/ai/clustering/pipeline';

// Solo tipos — ver comentario en registry.ts: importar por VALOR algo de
// ahí (o de pipeline.ts) en un componente cliente arrastraría código de
// servidor (fs, drizzle...) al bundle del navegador. Los datos reales
// llegan como props ya calculados desde page.tsx (Server Component).

const ICONS: Record<string, LucideIcon> = {
  FolderKanban,
  Sparkles,
  Brain,
  BookOpen,
  Target,
  Rocket,
  Flag,
  Stethoscope,
  Search,
  Map: MapIcon,
  Hammer,
  BarChart3,
  NotebookText,
  Circle,
};

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  built: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-800', dot: 'bg-green-500' },
  in_progress: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', dot: 'bg-amber-500' },
  planned: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-500', dot: 'bg-gray-400' },
};

const STATUS_LABELS: Record<string, string> = {
  built: 'Construido',
  in_progress: 'En progreso',
  planned: 'Planeado',
};

type MapNodeData = {
  label: string;
  description: string;
  status: 'built' | 'in_progress' | 'planned';
  icon?: string;
  clickable?: boolean;
  detailMapId?: string;
  highlighted?: boolean;
};

function MapNode({ data }: NodeProps) {
  const d = data as unknown as MapNodeData;
  const styles = STATUS_STYLES[d.status] ?? STATUS_STYLES.planned;
  const Icon = d.icon ? ICONS[d.icon] : null;

  return (
    <div
      className={[
        'w-[240px] rounded-xl border-2 p-4 shadow-sm transition-shadow',
        styles.bg,
        styles.border,
        d.clickable ? 'cursor-pointer border-dashed hover:shadow-md' : 'border-solid',
        d.highlighted ? 'ring-4 ring-blue-400 ring-offset-2 shadow-lg' : '',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <div className="mb-1.5 flex items-center gap-2">
        {Icon && <Icon className={`h-5 w-5 shrink-0 ${styles.text}`} />}
        <span className={`text-sm leading-tight font-semibold ${styles.text}`}>{d.label}</span>
      </div>
      <p className="text-xs leading-snug text-gray-600">{d.description}</p>
      <div className="mt-2.5 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${styles.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
          {STATUS_LABELS[d.status]}
        </span>
        {d.clickable && <span className="text-[11px] font-medium text-blue-600">Ver detalle →</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </div>
  );
}

function SectionLabel({ data }: NodeProps) {
  const d = data as unknown as { label: string };
  return (
    <div className="pointer-events-none text-xs font-semibold tracking-wide text-gray-400 uppercase">
      {d.label}
    </div>
  );
}

const nodeTypes = { mapNode: MapNode, sectionLabel: SectionLabel };

const NODE_WIDTH = 240;
const NODE_GAP = 60;
const ROW_Y_INFRA = 40;
const ROW_Y_FLOW = 260;

// Mismos ids que CORE_NODES en lib/architecture-map/registry.ts — usado
// solo para decidir en qué fila del nivel 1 va cada nodo, no representa
// lógica de negocio nueva.
const CORE_NODE_IDS = new Set(['core-projects', 'ai-gateway', 'brain-panel', 'admin-seo', 'competitor-analysis']);

type FlowElements = { nodes: Node[]; edges: Edge[]; flowOrder: string[] };

function toMapNode(n: SystemNode, x: number, y: number): Node {
  return {
    id: n.id,
    type: 'mapNode',
    position: { x, y },
    data: {
      label: n.name,
      description: n.description,
      status: n.status,
      icon: n.icon,
      clickable: Boolean(n.detailMapId),
      detailMapId: n.detailMapId,
    },
  };
}

function sequentialEdges(orderedIds: string[], animated = true): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < orderedIds.length - 1; i++) {
    edges.push({
      id: `e-${orderedIds[i]}-${orderedIds[i + 1]}`,
      source: orderedIds[i],
      target: orderedIds[i + 1],
      animated,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      style: { stroke: '#94a3b8' },
    });
  }
  return edges;
}

function buildLevel1(systemNodes: SystemNode[]): FlowElements {
  const coreNodes = systemNodes.filter((n) => CORE_NODE_IDS.has(n.id));
  const stageNodes = systemNodes.filter((n) => !CORE_NODE_IDS.has(n.id));

  const nodes: Node[] = [
    {
      id: 'label-infra',
      type: 'sectionLabel',
      position: { x: 0, y: ROW_Y_INFRA - 30 },
      data: { label: 'Infraestructura' },
      draggable: false,
      selectable: false,
      connectable: false,
    },
    ...coreNodes.map((n, i) => toMapNode(n, i * (NODE_WIDTH + NODE_GAP), ROW_Y_INFRA)),
    {
      id: 'label-flow',
      type: 'sectionLabel',
      position: { x: 0, y: ROW_Y_FLOW - 30 },
      data: { label: 'Flujo del proyecto (wizard)' },
      draggable: false,
      selectable: false,
      connectable: false,
    },
    ...stageNodes.map((n, i) => toMapNode(n, i * (NODE_WIDTH + NODE_GAP), ROW_Y_FLOW)),
  ];

  const edges = sequentialEdges(stageNodes.map((n) => n.id));

  // Relación no secuencial: el análisis de competidores se abre desde
  // dentro de un cluster ya creado en "Keyword Research", no es un paso
  // propio del wizard — se marca con una línea distinta (sin animar).
  if (stageNodes.some((n) => n.id === 'keyword_research') && coreNodes.some((n) => n.id === 'competitor-analysis')) {
    edges.push({
      id: 'e-keyword_research-competitor-analysis',
      source: 'keyword_research',
      target: 'competitor-analysis',
      animated: false,
      style: { stroke: '#cbd5e1', strokeDasharray: '4 4' },
      label: 'se usa desde',
      labelStyle: { fill: '#94a3b8', fontSize: 10 },
    });
  }

  return { nodes, edges, flowOrder: stageNodes.map((n) => n.id) };
}

function buildLevel2(steps: ProcessStep[]): FlowElements {
  const nodes: Node[] = steps.map((s, i) => ({
    id: s.id,
    type: 'mapNode',
    position: { x: i * (NODE_WIDTH + NODE_GAP), y: 0 },
    data: {
      label: s.name,
      description: s.description,
      status: s.status,
      clickable: false,
    },
  }));
  const edges = sequentialEdges(steps.map((s) => s.id));
  return { nodes, edges, flowOrder: steps.map((s) => s.id) };
}

const FLOW_STEP_MS = 800;

type Props = {
  systemNodes: SystemNode[];
  processMaps: Record<string, ProcessStep[]>;
};

export function ArchitectureMapClient({ systemNodes, processMaps }: Props) {
  const [detail, setDetail] = useState<{ id: string; title: string } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const level1 = useMemo(() => buildLevel1(systemNodes), [systemNodes]);
  const level2 = useMemo(
    () => (detail ? buildLevel2(processMaps[detail.id] ?? []) : null),
    [detail, processMaps]
  );

  const current = detail && level2 ? level2 : level1;

  const stopAnimation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsAnimating(false);
    setHighlightedId(null);
  }, []);

  useEffect(() => stopAnimation, [detail, stopAnimation]);
  useEffect(() => () => stopAnimation(), [stopAnimation]);

  const playFlow = useCallback(() => {
    const order = current.flowOrder;
    if (order.length === 0) return;
    stopAnimation();
    let idx = 0;
    setIsAnimating(true);
    setHighlightedId(order[0]);
    intervalRef.current = setInterval(() => {
      idx += 1;
      if (idx >= order.length) {
        stopAnimation();
        return;
      }
      setHighlightedId(order[idx]);
    }, FLOW_STEP_MS);
  }, [current.flowOrder, stopAnimation]);

  const nodesToRender = useMemo(
    () =>
      current.nodes.map((n) =>
        n.type === 'mapNode' ? { ...n, data: { ...n.data, highlighted: n.id === highlightedId } } : n
      ),
    [current.nodes, highlightedId]
  );

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      const data = node.data as unknown as MapNodeData;
      if (!data.detailMapId) return;
      stopAnimation();
      setDetail({ id: data.detailMapId, title: data.label });
    },
    [stopAnimation]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {detail && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDetail(null)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Volver al mapa general
            </Button>
          )}
          {detail && <span className="text-sm font-medium text-gray-700">Detalle: {detail.title}</span>}
        </div>
        <Button type="button" size="sm" variant={isAnimating ? 'secondary' : 'outline'} onClick={isAnimating ? stopAnimation : playFlow}>
          {isAnimating ? (
            <>
              <Square className="mr-1.5 h-4 w-4" />
              Detener
            </>
          ) : (
            <>
              <Play className="mr-1.5 h-4 w-4" />
              Ver flujo
            </>
          )}
        </Button>
      </div>

      <div className="h-[70vh] w-full rounded-lg border bg-gray-50/50">
        <ReactFlow
          nodes={nodesToRender}
          edges={current.edges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          nodesDraggable
          nodesConnectable={false}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
