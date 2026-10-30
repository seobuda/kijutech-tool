'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
  ArrowRight,
  Play,
  Square,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SystemNode } from '@/lib/architecture-map/registry';
import type { ProcessStep, TechnicalDetail } from '@/lib/ai/clustering/pipeline';
import type { LiveData, LiveRun } from '@/lib/operaciones/map-live';

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
  planned: 'Pendiente',
};

type Badge = { kind: 'ok' | 'error' | 'none'; text: string };

type MapNodeData = {
  label: string;
  description: string;
  status: 'built' | 'in_progress' | 'planned';
  icon?: string;
  clickable?: boolean;
  detailMapId?: string;
  highlighted?: boolean;
  group?: SystemNode['group'];
  technicalDetail?: TechnicalDetail;
  hasDetail?: boolean;
  badge?: Badge | null;
  settingsLine?: string | null;
  // Inyectado en tiempo de render (ver nodesToRender) en vez de vivir en
  // los datos "puros" del nodo — así los constructores de nivel no
  // necesitan conocer el estado del componente padre.
  onShowDetail?: () => void;
};

function MapNode({ data }: NodeProps) {
  const d = data as unknown as MapNodeData;
  const styles = STATUS_STYLES[d.status] ?? STATUS_STYLES.planned;
  const Icon = d.icon ? ICONS[d.icon] : null;
  const isSupport = d.group === 'support';

  return (
    <div
      className={[
        'w-[240px] rounded-xl border-2 p-4 shadow-sm transition-shadow',
        styles.bg,
        styles.border,
        // Los nodos de "Procesos de apoyo" llevan además un acento morado
        // a la izquierda — distingue visualmente esta fila de los pilares
        // de infraestructura sin pisar el color de estado (verde/gris).
        isSupport ? 'border-l-[6px] !border-l-violet-400' : '',
        d.clickable ? 'cursor-pointer border-dashed hover:shadow-md' : 'border-solid',
        d.highlighted ? 'ring-4 ring-blue-400 ring-offset-2 shadow-lg' : '',
      ].join(' ')}
      data-testid={`map-node-${d.label}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`h-5 w-5 shrink-0 ${styles.text}`} />}
          <span className={`text-sm leading-tight font-semibold ${styles.text}`}>{d.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isSupport && (
            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
              Apoyo
            </span>
          )}
          {d.hasDetail && (
            <button
              type="button"
              aria-label="Ver detalle"
              onClick={(e) => {
                // No debe disparar también el onNodeClick de "Ver
                // detalle" del nodo — parada explícita pedida.
                e.stopPropagation();
                d.onShowDetail?.();
              }}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-200/60 hover:text-gray-600"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="text-xs leading-snug text-gray-600">{d.description}</p>
      {d.settingsLine && <p className="mt-1.5 rounded bg-white/70 px-1.5 py-1 text-[11px] leading-snug text-gray-700">⚙ {d.settingsLine}</p>}
      {d.badge && (
        <p
          className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            d.badge.kind === 'error' ? 'bg-red-100 text-red-700' : d.badge.kind === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${d.badge.kind === 'error' ? 'bg-red-500' : d.badge.kind === 'ok' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          {d.badge.text}
        </p>
      )}
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
  const d = data as unknown as { label: string; accent?: 'support' };
  return (
    <div
      className={[
        'pointer-events-none text-xs font-semibold tracking-wide uppercase',
        d.accent === 'support' ? 'text-violet-400' : 'text-gray-400',
      ].join(' ')}
    >
      {d.label}
    </div>
  );
}

const nodeTypes = { mapNode: MapNode, sectionLabel: SectionLabel };

const NODE_WIDTH = 240;
const NODE_GAP = 60;
const ROW_Y_INFRA = 40;
const ROW_Y_SUPPORT = 300;
const ROW_Y_FLOW = 560;
const ROW_Y_FUTURE = 820;
const FUTURE_PER_ROW = 5;
const LANE_HEIGHT = 300;

type FlowElements = { nodes: Node[]; edges: Edge[]; flowOrder: string[] };

const hasDetailInfo = (s: Pick<ProcessStep, 'technicalDetail' | 'when' | 'ai' | 'code' | 'tables' | 'settings' | 'prompts' | 'next' | 'extension' | 'runs' | 'live'>) =>
  Boolean(s.technicalDetail || s.when || s.ai || s.code || s.tables?.length || s.settings?.length || s.prompts?.length || s.next || s.extension || s.runs?.length || s.live);

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
      group: n.group,
      technicalDetail: n.technicalDetail,
      hasDetail: Boolean(n.technicalDetail) || n.status === 'planned',
    },
  };
}

function edge(source: string, target: string, opts: Partial<Edge> = {}): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
    style: { stroke: '#94a3b8' },
    ...opts,
  };
}

function sequentialEdges(orderedIds: string[], animated = true): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < orderedIds.length - 1; i++) edges.push(edge(orderedIds[i], orderedIds[i + 1], { animated }));
  return edges;
}

function sectionLabel(id: string, y: number, label: string, accent?: 'support'): Node {
  return {
    id,
    type: 'sectionLabel',
    position: { x: 0, y: y - 30 },
    data: { label, accent },
    draggable: false,
    selectable: false,
    connectable: false,
  };
}

function buildLevel1(systemNodes: SystemNode[]): FlowElements {
  const coreNodes = systemNodes.filter((n) => n.group === 'infrastructure');
  const supportNodes = systemNodes.filter((n) => n.group === 'support');
  const stageNodes = systemNodes.filter((n) => n.group === 'flow');
  const futureNodes = systemNodes.filter((n) => n.group === 'future');
  const col = (i: number) => i * (NODE_WIDTH + NODE_GAP);

  const nodes: Node[] = [
    sectionLabel('label-infra', ROW_Y_INFRA, 'Infraestructura'),
    ...coreNodes.map((n, i) => toMapNode(n, col(i), ROW_Y_INFRA)),
    sectionLabel('label-support', ROW_Y_SUPPORT, 'Procesos de apoyo', 'support'),
    ...supportNodes.map((n, i) => toMapNode(n, col(i), ROW_Y_SUPPORT)),
    sectionLabel('label-flow', ROW_Y_FLOW, 'Flujo del proyecto (wizard)'),
    ...stageNodes.map((n, i) => toMapNode(n, col(i), ROW_Y_FLOW)),
  ];
  if (futureNodes.length) {
    nodes.push(sectionLabel('label-future', ROW_Y_FUTURE, 'Pendiente (todavía sin construir)'));
    futureNodes.forEach((n, i) => nodes.push(toMapNode(n, col(i % FUTURE_PER_ROW), ROW_Y_FUTURE + Math.floor(i / FUTURE_PER_ROW) * 230)));
  }

  const edges = sequentialEdges(stageNodes.map((n) => n.id));

  // Relación no secuencial: el análisis de competidores (fila "Procesos de
  // apoyo") se abre desde dentro de un cluster ya creado en "Keyword
  // Research", no es un paso propio del wizard — línea distinta, sin animar.
  if (stageNodes.some((n) => n.id === 'keyword_research') && supportNodes.some((n) => n.id === 'competitor-analysis')) {
    edges.push({
      id: 'e-keyword_research-competitor-analysis',
      source: 'keyword_research',
      target: 'competitor-analysis',
      animated: false,
      style: { stroke: '#c4b5fd', strokeDasharray: '4 4' },
      label: 'se usa desde',
      labelStyle: { fill: '#a78bfa', fontSize: 10 },
    });
  }
  // Conexiones extra declaradas en el registro (p. ej. Operaciones → Subagentes por área).
  for (const n of systemNodes) {
    for (const t of n.edgesTo ?? []) {
      edges.push({
        id: `e-${n.id}-${t.id}`,
        source: n.id,
        target: t.id,
        animated: false,
        style: { stroke: '#c4b5fd', strokeDasharray: '4 4' },
        label: t.label,
        labelStyle: { fill: '#7c3aed', fontSize: 10 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#c4b5fd' },
      });
    }
  }
  // Operaciones ↔ Integraciones: Operaciones usa las conexiones.
  if (coreNodes.some((n) => n.id === 'operaciones') && coreNodes.some((n) => n.id === 'integraciones')) {
    edges.push(edge('operaciones', 'integraciones', { animated: false, label: 'usa', labelStyle: { fill: '#64748b', fontSize: 10 } }));
  }

  return { nodes, edges, flowOrder: stageNodes.map((n) => n.id) };
}

// Antigüedad legible («hace 5 min»).
function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 90) return 'hace unos segundos';
  const m = Math.round(s / 60);
  if (m < 90) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 36) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

function stepRuns(step: ProcessStep, live: LiveData): { key: string; run: LiveRun }[] {
  return (step.live ? [step.live] : []).map((k) => ({ key: k, run: live.runs[k] })).filter((x) => x.run);
}

// Insignia de un nodo: error si algún proceso periódico (propio o de sus pasos) falló; si no, la última ejecución.
function badgeFor(step: ProcessStep, processMaps: Record<string, ProcessStep[]>, live: LiveData, now: number): Badge | null {
  const keys = new Set<string>();
  if (step.live) keys.add(step.live);
  if (step.detailMapId) for (const s of processMaps[step.detailMapId] ?? []) if (s.live) keys.add(s.live);
  const runs = [...keys].map((k) => live.runs[k]).filter(Boolean);
  if (runs.length === 0) return null;
  const err = runs.find((r) => r.error);
  if (err) return { kind: 'error', text: 'Error: ' + err.error!.slice(0, 40) };
  const times = runs.map((r) => r.at).filter((x): x is number => x !== null);
  if (times.length) {
    const latest = Math.max(...times);
    const run = runs.find((r) => r.at === latest)!;
    return { kind: 'ok', text: `${run.label}: ${ago(latest, now)}` };
  }
  return { kind: 'none', text: runs.find((r) => r.note)?.note?.slice(0, 48) ?? 'Sin ejecuciones todavía' };
}

// Una línea con los valores actuales del panel que afectan a este paso.
function settingsLineFor(step: ProcessStep, live: LiveData): string | null {
  const parts: string[] = [];
  for (const ref of step.settings ?? []) {
    const a = live.automations[ref.automation];
    if (!a) continue;
    if (!a.enabled) {
      parts.push(`${a.title}: apagada`);
      continue;
    }
    const fields = ref.fields ? a.fields.filter((f) => ref.fields!.includes(f.key)) : [];
    for (const f of fields) parts.push(`${f.label}: ${f.value}${f.unit ? ` ${f.unit}` : ''}`);
  }
  return parts.length ? parts.slice(0, 2).join(' · ') : null;
}

function buildLevel(steps: ProcessStep[], processMaps: Record<string, ProcessStep[]>, live: LiveData, now: number): FlowElements {
  const lanes: string[] = [];
  for (const s of steps) if (!lanes.includes(s.lane ?? '')) lanes.push(s.lane ?? '');
  const laneCount = new Map<string, number>();
  const nodes: Node[] = [];
  lanes.forEach((lane, li) => {
    if (lane && lanes.length > 1) nodes.push(sectionLabel(`lane-${li}`, li * LANE_HEIGHT + 40, lane));
  });
  for (const s of steps) {
    const lane = s.lane ?? '';
    const li = lanes.indexOf(lane);
    const i = laneCount.get(lane) ?? 0;
    laneCount.set(lane, i + 1);
    nodes.push({
      id: s.id,
      type: 'mapNode',
      position: { x: i * (NODE_WIDTH + NODE_GAP), y: li * LANE_HEIGHT + 40 },
      data: {
        label: s.name,
        description: s.description,
        status: s.status,
        icon: s.icon,
        clickable: Boolean(s.detailMapId),
        detailMapId: s.detailMapId,
        technicalDetail: s.technicalDetail,
        hasDetail: hasDetailInfo(s),
        badge: badgeFor(s, processMaps, live, now),
        settingsLine: settingsLineFor(s, live),
      } satisfies MapNodeData,
    });
  }
  const explicit = steps.some((s) => s.to);
  const ids = new Set(steps.map((s) => s.id));
  const edges = explicit
    ? steps.flatMap((s) => (s.to ?? []).filter((t) => ids.has(t)).map((t) => edge(s.id, t)))
    : sequentialEdges(steps.map((s) => s.id));
  return { nodes, edges, flowOrder: steps.map((s) => s.id) };
}

const FLOW_STEP_MS = 800;

type Props = {
  systemNodes: SystemNode[];
  processMaps: Record<string, ProcessStep[]>;
  live: LiveData;
};

export function ArchitectureMapClient({ systemNodes, processMaps, live }: Props) {
  const [path, setPath] = useState<string[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [modal, setModal] = useState<{ title: string; step: ProcessStep | null; node?: SystemNode } | null>(null);
  const [now, setNow] = useState(live.generatedAt);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setNow(Date.now()), []);

  // Nombre de cada mapa de detalle (el del nodo que lo abre).
  const titleOf = useCallback(
    (mapId: string): string => {
      const sys = systemNodes.find((n) => n.detailMapId === mapId);
      if (sys) return sys.name;
      for (const steps of Object.values(processMaps)) {
        const s = steps.find((x) => x.detailMapId === mapId);
        if (s) return s.name;
      }
      return mapId;
    },
    [systemNodes, processMaps]
  );

  const level1 = useMemo(() => buildLevel1(systemNodes), [systemNodes]);
  const levelN = useMemo(
    () => (path.length ? buildLevel(processMaps[path[path.length - 1]] ?? [], processMaps, live, now) : null),
    [path, processMaps, live, now]
  );
  const current = levelN ?? level1;

  const stopAnimation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsAnimating(false);
    setHighlightedId(null);
  }, []);

  useEffect(() => stopAnimation, [path, stopAnimation]);
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

  const currentSteps = path.length ? processMaps[path[path.length - 1]] ?? [] : [];

  const nodesToRender = useMemo(
    () =>
      current.nodes.map((n) => {
        if (n.type !== 'mapNode') return n;
        const d = n.data as unknown as MapNodeData;
        const step = currentSteps.find((s) => s.id === n.id);
        const sys = systemNodes.find((s) => s.id === n.id);
        return {
          ...n,
          data: {
            ...n.data,
            highlighted: n.id === highlightedId,
            onShowDetail: d.hasDetail ? () => setModal({ title: d.label, step: step ?? null, node: sys }) : undefined,
          },
        };
      }),
    [current.nodes, highlightedId, currentSteps, systemNodes]
  );

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      const data = node.data as unknown as MapNodeData;
      if (!data.detailMapId) return;
      stopAnimation();
      setPath((p) => [...p, data.detailMapId!]);
    },
    [stopAnimation]
  );

  const goTo = (p: string[]) => {
    stopAnimation();
    setPath(p);
  };

  const step = modal?.step ?? null;
  const detail = step?.technicalDetail ?? modal?.node?.technicalDetail ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2" data-testid="map-breadcrumb">
          {path.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => goTo(path.slice(0, -1))}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Volver
            </Button>
          )}
          <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
            <button type="button" className={path.length ? 'text-blue-600 hover:underline' : 'font-medium text-gray-800'} onClick={() => goTo([])}>
              Mapa general
            </button>
            {path.map((id, i) => (
              <span key={`${id}-${i}`} className="flex items-center gap-1">
                <span className="text-gray-400">›</span>
                <button
                  type="button"
                  className={i < path.length - 1 ? 'text-blue-600 hover:underline' : 'font-medium text-gray-800'}
                  onClick={() => goTo(path.slice(0, i + 1))}
                >
                  {titleOf(id)}
                </button>
              </span>
            ))}
          </nav>
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
          key={path.join('/') || 'root'}
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

      <Dialog open={modal !== null} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{modal?.title}</DialogTitle>
          </DialogHeader>
          {modal && (
            <div className="space-y-4 text-sm" data-testid="map-detail">
              {(step?.description ?? modal.node?.description) && <p className="text-gray-600">{step?.description ?? modal.node?.description}</p>}

              {step?.when && <Section title="Cuándo se ejecuta">{step.when}</Section>}
              {step?.ai && <Section title="Qué decide la IA">{step.ai}</Section>}
              {step?.code && <Section title="Qué decide el código">{step.code}</Section>}

              {step?.prompts && step.prompts.length > 0 && (
                <Section title="Prompts de IA que usa">
                  <ul className="space-y-1">
                    {step.prompts.map((k) => (
                      <li key={k}>
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{k}</code>{' '}
                        <span className="text-gray-500">
                          {live.prompts[k] ? `${live.prompts[k].name}${live.prompts[k].active ? '' : ' (inactivo)'}` : 'no encontrado en la base de datos'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {step?.tables && step.tables.length > 0 && (
                <Section title="Tablas que usa">
                  <div className="flex flex-wrap gap-1.5">
                    {step.tables.map((t) => (
                      <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {t}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {step?.settings && step.settings.length > 0 && (
                <Section title="Ajustes del panel (valores actuales)">
                  <ul className="space-y-2">
                    {step.settings.map((ref) => {
                      const a = live.automations[ref.automation];
                      if (!a) return null;
                      const fields = ref.fields ? a.fields.filter((f) => ref.fields!.includes(f.key)) : a.fields;
                      return (
                        <li key={ref.automation} className="rounded-md border border-gray-200 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-800">{a.title}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                              {a.enabled ? 'Encendida' : 'Apagada'}
                            </span>
                          </div>
                          {fields.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-gray-600">
                              {fields.map((f) => (
                                <li key={f.key}>
                                  {f.label}: <strong>{f.value}</strong>
                                  {f.unit ? ` ${f.unit}` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                          {a.customTemplate && <p className="mt-1 text-xs text-gray-500">Con texto personalizado.</p>}
                          <Link href={`/dashboard/operaciones/automatizaciones#auto-${ref.automation}`} className="mt-1 inline-block text-xs font-medium text-blue-600 hover:underline">
                            Abrir este ajuste →
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              )}

              {step && (step.live || step.runs?.length) && (
                <Section title="Última ejecución">
                  {step.runs && step.runs.length > 0 && (
                    <p className="mb-1 text-xs text-gray-500">
                      Lo ejecuta el planificador: {step.runs.map((r) => `${r}()`).join(', ')}
                    </p>
                  )}
                  {stepRuns(step, live).map(({ key, run }) => (
                    <div key={key} className="space-y-0.5">
                      <p>
                        {run.label}:{' '}
                        <strong>{run.at ? `${ago(run.at, now)} (${new Date(run.at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })})` : 'sin ejecuciones todavía'}</strong>
                      </p>
                      {run.error ? <p className="text-red-600">Error: {run.error}</p> : <p className="text-emerald-700">Sin errores</p>}
                      {run.note && <p className="text-gray-500">{run.note}</p>}
                    </div>
                  ))}
                </Section>
              )}

              {step?.extension && <Section title="Punto de extensión">{step.extension}</Section>}

              {detail && (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-gray-600">{detail.summary}</p>
                  {detail.stack && detail.stack.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-gray-500 uppercase">Stack</p>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.stack.map((item) => (
                          <span key={item} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.keyDecisions && detail.keyDecisions.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-gray-500 uppercase">Decisiones clave</p>
                      <ul className="list-disc space-y-1 pl-4 text-gray-600">
                        {detail.keyDecisions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {step?.next && (
                <Button
                  type="button"
                  size="sm"
                  data-testid="map-next"
                  onClick={() => {
                    goTo(step.next!.path);
                    setModal(null);
                  }}
                >
                  {step.next.label}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-500 uppercase">{title}</p>
      <div className="text-gray-700">{children}</div>
    </div>
  );
}
