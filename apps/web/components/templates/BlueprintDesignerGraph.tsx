"use client";

import React from 'react';
import { Card } from '@rouh/ui';

export interface DesignerGraphNode {
  id: string;
  label: string;
  type: 'identity' | 'state' | 'slot' | 'policy' | 'signal' | 'automation';
  description?: string;
  meta?: Record<string, any>;
}

export interface DesignerGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  meta?: Record<string, any>;
}

export interface DesignerGraph {
  nodes: DesignerGraphNode[];
  edges: DesignerGraphEdge[];
}

interface BlueprintDesignerGraphProps {
  graph: DesignerGraph;
}

const groupOrder: Array<DesignerGraphNode['type']> = ['identity', 'state', 'slot', 'signal', 'policy', 'automation'];

const typeLabels: Record<DesignerGraphNode['type'], string> = {
  identity: 'Identities',
  state: 'States',
  slot: 'Data Slots',
  signal: 'Signals',
  policy: 'Guardrails',
  automation: 'Automations',
};

const badgeStyles: Record<DesignerGraphNode['type'], string> = {
  identity: 'bg-blue-100 text-blue-700',
  state: 'bg-purple-100 text-purple-700',
  slot: 'bg-amber-100 text-amber-700',
  signal: 'bg-teal-100 text-teal-700',
  policy: 'bg-rose-100 text-rose-700',
  automation: 'bg-emerald-100 text-emerald-700',
};

function GroupColumn({ type, nodes }: { type: DesignerGraphNode['type']; nodes: DesignerGraphNode[] }) {
  if (!nodes.length) return null;
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
        {typeLabels[type]}
      </h4>
      <div className="flex flex-col gap-3">
        {nodes.map((node) => (
          <div key={node.id} className="bg-white border border-gray-200 rounded-lg px-3 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-1 ${badgeStyles[type]}`}>
                {typeLabels[type]}
              </span>
              <span className="text-[10px] text-gray-400">{node.id}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-gray-900">{node.label}</p>
            {node.description && (
              <p className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{node.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EdgeList({ edges, nodes }: { edges: DesignerGraphEdge[]; nodes: DesignerGraphNode[] }) {
  if (!edges.length) return null;

  const labelLookup = nodes.reduce<Record<string, string>>((acc, node) => {
    acc[node.id] = node.label;
    return acc;
  }, {});

  return (
    <div className="mt-4 border-t border-gray-200 pt-3">
      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2">Flows & Relationships</h4>
      <ul className="space-y-2 text-xs text-gray-600">
        {edges.map((edge) => (
          <li key={edge.id} className="flex items-start gap-2">
            <span className="mt-0.5 text-gray-400">•</span>
            <span>
              <span className="font-medium text-gray-800">{labelLookup[edge.source] || edge.source}</span>
              <span className="text-gray-400"> ⟶ </span>
              <span className="font-medium text-gray-800">{labelLookup[edge.target] || edge.target}</span>
              {edge.label && <span className="text-gray-500"> ({edge.label})</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BlueprintDesignerGraph({ graph }: BlueprintDesignerGraphProps) {
  const grouped = groupOrder.map((type) => ({
    type,
    nodes: graph.nodes.filter((node) => node.type === type),
  }));

  const hasAnyNodes = graph.nodes && graph.nodes.length > 0;

  return (
    <Card className="border border-gray-200/80 shadow-sm w-full">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Coordination Graph</h3>
        <p className="text-xs text-gray-500">
          Identities, workflow states, and supporting elements update continuously from the conversation.
        </p>
      </div>
      <div className="px-4 py-4 space-y-4">
        {hasAnyNodes ? (
          <div className="grid md:grid-cols-2 gap-6">
            {grouped.map(({ type, nodes }) => (
              <GroupColumn key={type} type={type} nodes={nodes} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            No graph elements yet. Describe the people involved and the stages of coordination to populate the canvas.
          </p>
        )}

        <EdgeList edges={graph.edges || []} nodes={graph.nodes || []} />
      </div>
    </Card>
  );
}
