import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { X, Plus, Zap, MessageCircle, Clock, ArrowRight, StickyNote } from 'lucide-react';

// ─── Design tokens ──────────────────────────────────────────────────────────
const BG_MAIN    = '#F5F6FA';
const BG_CARD    = '#FFFFFF';
const BG_SIDEBAR = '#FFFFFF';
const BORDER     = '#E5E7EB';
const TEXT_PRI   = '#14171F';
const TEXT_SEC   = '#6B7280';

const TYPE_META = {
  trigger_new_lead:          { color: '#238636', label: 'Novo Lead',           icon: <Zap size={13} /> },
  trigger_stage_changed:     { color: '#238636', label: 'Muda de Etapa',       icon: <Zap size={13} /> },
  trigger_message_received:  { color: '#238636', label: 'Mensagem Recebida',   icon: <Zap size={13} /> },
  wait:                      { color: '#D29922', label: 'Aguardar',            icon: <Clock size={13} /> },
  send_whatsapp:             { color: '#2EA043', label: 'Enviar WhatsApp',     icon: <MessageCircle size={13} /> },
  move_stage:                { color: '#1F6FEB', label: 'Mover Etapa',         icon: <ArrowRight size={13} /> },
  add_note:                  { color: '#6E7681', label: 'Adicionar Nota',      icon: <StickyNote size={13} /> },
};

const STAGES_LIST = [
  { id: 'novo',         label: 'Novo Lead' },
  { id: 'qualificacao', label: 'Qualificação' },
  { id: 'proposta',     label: 'Proposta Enviada' },
  { id: 'negociacao',   label: 'Negociação' },
  { id: 'ganho',        label: 'Ganho' },
  { id: 'perdido',      label: 'Perdido' },
];

const DEFAULT_EDGE = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: '#4F3CC9', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#4F3CC9' },
};

// ─── Shared node shell ───────────────────────────────────────────────────────
function NodeShell({ id, accentColor, title, icon, children, data }) {
  function onDelete() {
    if (data && data.onDelete) data.onDelete(id);
  }
  return (
    <div style={{
      width: 260,
      background: BG_CARD,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      fontFamily: 'Inter, sans-serif',
      fontSize: 13,
      color: TEXT_PRI,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      position: 'relative',
    }}>
      {/* Colored top strip */}
      <div style={{ height: 4, background: accentColor, borderRadius: '8px 8px 0 0' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px 6px', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ color: accentColor, display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{ fontWeight: 600, flex: 1, color: TEXT_PRI, fontSize: 12 }}>{title}</span>
        <button
          onClick={onDelete}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_SEC, padding: 0, display: 'flex', alignItems: 'center', lineHeight: 1 }}
          title="Remover nó"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '8px 10px 10px' }}>
        {children}
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ width: 10, height: 10, background: '#4F3CC9', border: `2px solid ${BG_CARD}`, top: -6 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ width: 10, height: 10, background: '#58A6FF', border: `2px solid ${BG_CARD}`, bottom: -6 }}
      />
    </div>
  );
}

// ─── Custom node components ───────────────────────────────────────────────────
function TriggerNode({ id, data }) {
  const meta = TYPE_META[data.nodeType] || TYPE_META['trigger_new_lead'];
  const [stage, setStage] = useState(data.stage || '');

  function onChange(val) {
    setStage(val);
    if (data.onChange) data.onChange(id, { stage: val });
  }

  return (
    <NodeShell id={id} accentColor={meta.color} title={meta.label} icon={meta.icon} data={data}>
      <span style={{ color: TEXT_SEC, fontSize: 11 }}>Gatilho</span>
      {data.nodeType === 'trigger_stage_changed' && (
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 10, color: TEXT_SEC, display: 'block', marginBottom: 2 }}>Etapa alvo</label>
          <select
            value={stage}
            onChange={e => onChange(e.target.value)}
            style={inputStyle}
            className="nodrag"
          >
            <option value="">Qualquer etapa</option>
            {STAGES_LIST.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      )}
    </NodeShell>
  );
}

function WaitNode({ id, data }) {
  const meta = TYPE_META['wait'];
  const [minutes, setMinutes] = useState(data.minutes || 5);

  function onChange(val) {
    setMinutes(val);
    if (data.onChange) data.onChange(id, { minutes: val });
  }

  return (
    <NodeShell id={id} accentColor={meta.color} title={meta.label} icon={meta.icon} data={data}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          min={1}
          value={minutes}
          onChange={e => onChange(Number(e.target.value))}
          style={{ ...inputStyle, width: 56 }}
          className="nodrag"
        />
        <span style={{ color: TEXT_SEC, fontSize: 11 }}>minutos</span>
      </div>
    </NodeShell>
  );
}

function SendWhatsAppNode({ id, data }) {
  const meta = TYPE_META['send_whatsapp'];
  const [message, setMessage] = useState(data.message || '');

  function onChange(val) {
    setMessage(val);
    if (data.onChange) data.onChange(id, { message: val });
  }

  return (
    <NodeShell id={id} accentColor={meta.color} title={meta.label} icon={meta.icon} data={data}>
      <textarea
        value={message}
        onChange={e => onChange(e.target.value)}
        placeholder="Mensagem... use {nome}, {empresa}"
        rows={3}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
        className="nodrag"
      />
    </NodeShell>
  );
}

function MoveStageNode({ id, data }) {
  const meta = TYPE_META['move_stage'];
  const [stage, setStage] = useState(data.stage || '');

  function onChange(val) {
    setStage(val);
    if (data.onChange) data.onChange(id, { stage: val });
  }

  return (
    <NodeShell id={id} accentColor={meta.color} title={meta.label} icon={meta.icon} data={data}>
      <select
        value={stage}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
        className="nodrag"
      >
        <option value="">Selecionar etapa</option>
        {STAGES_LIST.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </NodeShell>
  );
}

function AddNoteNode({ id, data }) {
  const meta = TYPE_META['add_note'];
  const [note, setNote] = useState(data.note || '');

  function onChange(val) {
    setNote(val);
    if (data.onChange) data.onChange(id, { note: val });
  }

  return (
    <NodeShell id={id} accentColor={meta.color} title={meta.label} icon={meta.icon} data={data}>
      <textarea
        value={note}
        onChange={e => onChange(e.target.value)}
        placeholder="Texto da nota interna..."
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 44 }}
        className="nodrag"
      />
    </NodeShell>
  );
}

const inputStyle = {
  width: '100%',
  background: '#F9FAFB',
  border: `1px solid ${BORDER}`,
  borderRadius: 5,
  color: TEXT_PRI,
  fontSize: 12,
  padding: '5px 8px',
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
  boxSizing: 'border-box',
};

// ─── Register node types (outside component to avoid re-registration) ─────────
const nodeTypes = {
  trigger_new_lead:         TriggerNode,
  trigger_stage_changed:    TriggerNode,
  trigger_message_received: TriggerNode,
  wait:                     WaitNode,
  send_whatsapp:            SendWhatsAppNode,
  move_stage:               MoveStageNode,
  add_note:                 AddNoteNode,
};

// ─── Palette items ────────────────────────────────────────────────────────────
const PALETTE_SECTIONS = [
  {
    title: 'GATILHOS',
    items: [
      { nodeType: 'trigger_new_lead',         label: 'Novo Lead',         defaultData: { nodeType: 'trigger_new_lead', label: 'Novo Lead', stage: '' } },
      { nodeType: 'trigger_stage_changed',    label: 'Muda de Etapa',    defaultData: { nodeType: 'trigger_stage_changed', label: 'Muda de Etapa', stage: '' } },
      { nodeType: 'trigger_message_received', label: 'Mensagem Recebida', defaultData: { nodeType: 'trigger_message_received', label: 'Mensagem Recebida', stage: '' } },
    ],
  },
  {
    title: 'AÇÕES',
    items: [
      { nodeType: 'send_whatsapp', label: 'Enviar WhatsApp', defaultData: { nodeType: 'send_whatsapp', message: '' } },
      { nodeType: 'wait',          label: 'Aguardar',        defaultData: { nodeType: 'wait', minutes: 5 } },
      { nodeType: 'move_stage',    label: 'Mover Etapa',     defaultData: { nodeType: 'move_stage', stage: '' } },
      { nodeType: 'add_note',      label: 'Adicionar Nota',  defaultData: { nodeType: 'add_note', note: '' } },
    ],
  },
];

// ─── Main FlowCanvas component ────────────────────────────────────────────────
let nodeIdCounter = 1;
function genId() { return `node_${nodeIdCounter++}`; }

export default function FlowCanvas({ name, onNameChange, initialNodes = [], initialEdges = [], onSave, onClose }) {
  const reactFlowWrapper = useRef(null);
  const [rfInstance, setRfInstance] = useState(null);

  // Inject callbacks into node data when we get nodes from parent
  const injectCallbacks = useCallback((rawNodes) => {
    return rawNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        onDelete: handleDeleteNode,
        onChange: handleNodeDataChange,
      },
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(injectCallbacks(initialNodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // When nodes state changes outside (initial load), re-inject callbacks
  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(injectCallbacks(initialNodes));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Callbacks ─────────────────────────────────────────────────────────────
  function handleDeleteNode(id) {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(e => e.source !== id && e.target !== id));
  }

  function handleNodeDataChange(id, patch) {
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
  }

  const onConnect = useCallback((params) => {
    setEdges(es => addEdge({ ...params, ...DEFAULT_EDGE }, es));
  }, [setEdges]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/reactflow');
    if (!raw) return;
    const { nodeType, defaultData } = JSON.parse(raw);

    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const pos = rfInstance.screenToFlowPosition({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    });

    const id = genId();
    const newNode = {
      id,
      type: nodeType,
      position: pos,
      data: {
        ...defaultData,
        onDelete: handleDeleteNode,
        onChange: handleNodeDataChange,
      },
    };
    setNodes(ns => [...ns, newNode]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfInstance]);

  // ── Save logic ─────────────────────────────────────────────────────────────
  function handleSave() {
    const triggerNode = nodes.find(n => n.type && n.type.startsWith('trigger_'));

    if (!triggerNode) {
      alert('Adicione um gatilho ao fluxo antes de salvar.');
      return;
    }

    // Walk edges from trigger → follow source → target in order
    const orderedActionNodes = [];
    let currentId = triggerNode.id;
    const visited = new Set([currentId]);

    for (let i = 0; i < nodes.length; i++) {
      const nextEdge = edges.find(e => e.source === currentId);
      if (!nextEdge) break;
      const nextNode = nodes.find(n => n.id === nextEdge.target);
      if (!nextNode || visited.has(nextNode.id)) break;
      visited.add(nextNode.id);
      orderedActionNodes.push(nextNode);
      currentId = nextNode.id;
    }

    // Convert to actions array
    const actions = orderedActionNodes
      .filter(n => !n.type.startsWith('trigger_'))
      .map(n => {
        const d = n.data;
        if (n.type === 'send_whatsapp') return { type: 'send_whatsapp', message: d.message || '' };
        if (n.type === 'wait')          return { type: 'wait', minutes: d.minutes || 5 };
        if (n.type === 'move_stage')    return { type: 'move_stage', stage: d.stage || '' };
        if (n.type === 'add_note')      return { type: 'add_note', note: d.note || '' };
        return null;
      })
      .filter(Boolean);

    // Strip callbacks from node data before saving
    const cleanNodes = nodes.map(n => ({
      ...n,
      data: (({ onDelete, onChange, ...rest }) => rest)(n.data),
    }));

    onSave({
      trigger_type: triggerNode.type.replace('trigger_', ''),
      trigger_config: { stage: triggerNode.data.stage || '' },
      actions,
      nodes: cleanNodes,
      edges,
    });
  }

  const isEmpty = nodes.length === 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', flexDirection: 'column',
      background: BG_MAIN,
      fontFamily: 'Inter, sans-serif',
    }}>

      {/* ── Top Bar ── */}
      <div style={{
        height: 56,
        background: BG_SIDEBAR,
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
        flexShrink: 0,
      }}>
        {/* Logo mark */}
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: '#4F3CC9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 13,
        }}>P</div>

        <div style={{ width: 1, height: 24, background: BORDER }} />

        {/* Name input */}
        <input
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Nome da automação..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: TEXT_PRI,
            fontSize: 15,
            fontWeight: 600,
            outline: 'none',
            fontFamily: 'Inter, sans-serif',
          }}
        />

        {/* Buttons */}
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: `1px solid ${BORDER}`,
            borderRadius: 7,
            color: TEXT_SEC,
            fontSize: 13,
            fontWeight: 500,
            padding: '6px 14px',
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          style={{
            background: '#4F3CC9',
            border: 'none',
            borderRadius: 7,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            padding: '6px 18px',
            cursor: 'pointer',
          }}
        >
          Salvar
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: 240,
          flexShrink: 0,
          background: BG_SIDEBAR,
          borderRight: `1px solid ${BORDER}`,
          overflowY: 'auto',
          padding: '16px 12px',
        }}>
          {PALETTE_SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom: 20 }}>
              <p style={{
                fontSize: 10,
                fontWeight: 700,
                color: TEXT_SEC,
                letterSpacing: '0.08em',
                marginBottom: 8,
                paddingLeft: 4,
              }}>{section.title}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {section.items.map(item => {
                  const meta = TYPE_META[item.nodeType];
                  return (
                    <div
                      key={item.nodeType}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData(
                          'application/reactflow',
                          JSON.stringify({ nodeType: item.nodeType, defaultData: item.defaultData })
                        );
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 10px',
                        borderRadius: 7,
                        border: `1px solid ${BORDER}`,
                        background: BG_CARD,
                        cursor: 'grab',
                        fontSize: 12,
                        color: TEXT_PRI,
                        userSelect: 'none',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = meta.color}
                      onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}
                    >
                      <span style={{ color: meta.color, display: 'flex', alignItems: 'center' }}>{meta.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Help */}
          <div style={{
            marginTop: 12,
            padding: '10px 10px',
            borderRadius: 7,
            background: '#F3F4F6',
            border: `1px solid ${BORDER}`,
            fontSize: 11,
            color: TEXT_SEC,
            lineHeight: 1.5,
          }}>
            <span style={{ fontWeight: 600, color: '#4F3CC9' }}>Dica:</span> Arraste um bloco para o canvas. Conecte os nós puxando do círculo inferior de um para o superior do próximo.
          </div>
        </aside>

        {/* ── Canvas ── */}
        <div ref={reactFlowWrapper} style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={DEFAULT_EDGE}
            fitView={nodes.length > 0}
            style={{ background: BG_MAIN }}
            deleteKeyCode="Delete"
          >
            <Background
              color="#E5E7EB"
              gap={20}
              size={1}
              style={{ background: BG_MAIN }}
            />
            <Controls
              style={{
                background: '#fff',
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
              }}
            />
          </ReactFlow>

          {/* Empty state hint */}
          {isEmpty && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
              color: TEXT_SEC,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: '#EDE9FE',
                border: `1px dashed #C4B5FD`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <Zap size={24} style={{ color: '#7C3AED' }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 500, color: TEXT_SEC, marginBottom: 4 }}>
                Arraste um gatilho do painel lateral para começar
              </p>
              <p style={{ fontSize: 12, color: '#9CA3AF' }}>
                Conecte os nós para criar o fluxo de automação
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
