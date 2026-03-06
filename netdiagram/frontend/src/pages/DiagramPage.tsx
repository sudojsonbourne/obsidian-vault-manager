import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import coseBilkentPkg from 'cytoscape-cose-bilkent';
import { getFullGraph, getFilteredGraph } from '../api';
import { GraphData, GraphNode, GraphEdge, FilterCriteria } from '../types';

// Register the cose-bilkent layout — handle CJS default interop
const coseBilkent = (coseBilkentPkg as any).default ?? coseBilkentPkg;
try {
  (cytoscape as any).use(coseBilkent);
} catch (_) {
  // Already registered — safe to ignore
}

const VENDOR_COLORS: Record<string, string> = {
  cisco: '#0e7490',
  paloalto: '#dc2626',
  excel: '#16a34a',
  unknown: '#6366f1',
};

function buildElements(data: GraphData) {
  const nodes = data.nodes.map((n: GraphNode) => ({
    data: {
      id: n.id,
      label: n.hostname,
      vendor: n.vendor,
      model: n.model,
      interfaces: n.interfaces,
      properties: n.properties,
      bgColor: VENDOR_COLORS[n.vendor] || VENDOR_COLORS.unknown,
    },
  }));

  const edges = data.edges.map((e: GraphEdge) => ({
    data: {
      id: e.id,
      source: e.sourceDeviceId,
      target: e.targetDeviceId,
      label: e.label || '',
      totalOccurrences: e.totalOccurrences,
      protocols: e.protocols?.join(', '),
      ports: e.ports?.join(', '),
      connectionType: e.connectionType,
      vlan: e.vlan,
    },
  }));

  return [...nodes, ...edges];
}

const LAYOUT_OPTIONS: Record<string, cytoscape.LayoutOptions> = {
  'cose-bilkent': { name: 'cose-bilkent', animate: true, randomize: false, idealEdgeLength: 140 } as cytoscape.LayoutOptions,
  cose: { name: 'cose', animate: true, randomize: false },
  grid: { name: 'grid' },
  circle: { name: 'circle' },
  breadthfirst: { name: 'breadthfirst', directed: false },
  concentric: { name: 'concentric' },
};

const CY_STYLE: any[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(bgColor)',
      'label': 'data(label)',
      'color': '#fff',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 6,
      'font-size': '11px',
      'width': 48,
      'height': 48,
      'border-width': 2,
      'border-color': '#334155',
    },
  },
  {
    selector: 'node:selected',
    style: { 'border-color': '#7c3aed', 'border-width': 3 },
  },
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': '#475569',
      'target-arrow-color': '#475569',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'label': 'data(label)',
      'font-size': '10px',
      'color': '#94a3b8',
      'text-background-color': '#1a1d27',
      'text-background-opacity': 0.9,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'edge[totalOccurrences > 0]',
    style: { 'line-color': '#7c3aed', 'target-arrow-color': '#7c3aed', 'width': 3 },
  },
];

interface NodePanel {
  node: GraphNode;
  x: number;
  y: number;
}

export default function DiagramPage() {
  const navigate = useNavigate();
  const cyRef = useRef<cytoscape.Core | null>(null);

  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [elements, setElements] = useState<cytoscape.ElementDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLayout, setSelectedLayout] = useState('cose-bilkent');
  const [nodePanel, setNodePanel] = useState<NodePanel | null>(null);

  // Filter state
  const [filters, setFilters] = useState<FilterCriteria>({
    minOccurrences: 0,
    showAllEdges: false,
  });
  const [filterInput, setFilterInput] = useState({ ip: '', protocol: '', port: '', zone: '', interface: '' });

  // Load initial full graph
  useEffect(() => {
    setLoading(true);
    getFullGraph()
      .then((data) => {
        setGraphData(data);
        setElements(buildElements(data));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load graph');
        setLoading(false);
      });
  }, []);

  // Apply layout when changed
  useEffect(() => {
    if (!cyRef.current || elements.length === 0) return;
    const layout = cyRef.current.layout(LAYOUT_OPTIONS[selectedLayout] || LAYOUT_OPTIONS['cose-bilkent']);
    layout.run();
  }, [selectedLayout, elements]);

  const applyFilters = useCallback(async () => {
    const criteria: FilterCriteria = {
      ...filters,
      ip: filterInput.ip || undefined,
      protocol: filterInput.protocol || undefined,
      port: filterInput.port ? parseInt(filterInput.port) : undefined,
      zone: filterInput.zone || undefined,
      interface: filterInput.interface || undefined,
    };

    // If no real criteria, show full graph
    const hasAny = criteria.ip || criteria.protocol || criteria.port || criteria.zone || criteria.interface || (criteria.minOccurrences && criteria.minOccurrences > 0);
    if (!hasAny) {
      setElements(buildElements(graphData));
      return;
    }

    setLoading(true);
    try {
      const filtered = await getFilteredGraph(criteria);
      setElements(buildElements(filtered));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Filter failed');
    } finally {
      setLoading(false);
    }
  }, [filters, filterInput, graphData]);

  const resetFilters = () => {
    setFilterInput({ ip: '', protocol: '', port: '', zone: '', interface: '' });
    setFilters({ minOccurrences: 0, showAllEdges: false });
    setElements(buildElements(graphData));
  };

  // Collect unique values for dropdowns
  const allZones = Array.from(new Set(graphData.nodes.flatMap((n) => n.interfaces.map((i) => i.zone).filter(Boolean))));
  const allProtocols = Array.from(new Set(graphData.edges.flatMap((e) => e.protocols || [])));

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f1117', overflow: 'hidden' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div style={{ width: 280, background: '#1a1d27', padding: '1rem', overflowY: 'auto', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#7c3aed' }}>🌐 NetDiagram</div>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', padding: '2px 8px', fontSize: '0.75rem' }}>Upload</button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: '#0f1117', borderRadius: 8, padding: '0.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7c3aed' }}>{elements.filter((e) => !('source' in (e.data || {}))).length}</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Devices</div>
          </div>
          <div style={{ flex: 1, background: '#0f1117', borderRadius: 8, padding: '0.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0e7490' }}>{elements.filter((e) => 'source' in (e.data || {})).length}</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Links</div>
          </div>
        </div>

        {/* Layout Selector */}
        <div>
          <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Layout</label>
          <select
            value={selectedLayout}
            onChange={(e) => setSelectedLayout(e.target.value)}
            style={{ width: '100%', background: '#0f1117', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '0.4rem', fontSize: '0.85rem' }}
          >
            {Object.keys(LAYOUT_OPTIONS).map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Filters */}
        <div style={{ borderTop: '1px solid #1e293b', paddingTop: 12 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Filters</div>

          {/* IP */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>IP Address</label>
            <input value={filterInput.ip} onChange={(e) => setFilterInput((p) => ({ ...p, ip: e.target.value }))}
              placeholder="e.g. 192.168.1.1" style={{ width: '100%', background: '#0f1117', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
          </div>

          {/* Protocol */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Protocol</label>
            <select value={filterInput.protocol} onChange={(e) => setFilterInput((p) => ({ ...p, protocol: e.target.value }))}
              style={{ width: '100%', background: '#0f1117', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '0.3rem', fontSize: '0.8rem' }}>
              <option value="">All protocols</option>
              {allProtocols.map((p) => <option key={p} value={p}>{p}</option>)}
              {!allProtocols.includes('TCP') && <option value="TCP">TCP</option>}
              {!allProtocols.includes('UDP') && <option value="UDP">UDP</option>}
            </select>
          </div>

          {/* Port */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Destination Port</label>
            <input type="number" value={filterInput.port} onChange={(e) => setFilterInput((p) => ({ ...p, port: e.target.value }))}
              placeholder="e.g. 443" style={{ width: '100%', background: '#0f1117', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
          </div>

          {/* Zone */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>Zone</label>
            <select value={filterInput.zone} onChange={(e) => setFilterInput((p) => ({ ...p, zone: e.target.value }))}
              style={{ width: '100%', background: '#0f1117', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '0.3rem', fontSize: '0.8rem' }}>
              <option value="">All zones</option>
              {allZones.map((z) => <option key={z as string} value={z as string}>{z as string}</option>)}
            </select>
          </div>

          {/* Min Occurrences */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>
              Min Occurrences: <strong style={{ color: '#e2e8f0' }}>{filters.minOccurrences}</strong>
            </label>
            <input type="range" min={0} max={1000} step={10} value={filters.minOccurrences || 0}
              onChange={(e) => setFilters((p) => ({ ...p, minOccurrences: parseInt(e.target.value) }))}
              style={{ width: '100%', accentColor: '#7c3aed' }} />
          </div>

          {/* Show All Edges Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#94a3b8', cursor: 'pointer', marginBottom: 12 }}>
            <input type="checkbox" checked={filters.showAllEdges || false} onChange={(e) => setFilters((p) => ({ ...p, showAllEdges: e.target.checked }))} />
            Show all edges between matched devices
          </label>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={applyFilters} style={{ flex: 1, background: '#7c3aed', border: 'none', borderRadius: 6, color: '#fff', padding: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              Apply
            </button>
            <button onClick={resetFilters} style={{ flex: 1, background: '#334155', border: 'none', borderRadius: 6, color: '#fff', padding: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
              Reset
            </button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ borderTop: '1px solid #1e293b', paddingTop: 12 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Legend</div>
          {Object.entries(VENDOR_COLORS).map(([vendor, color]) => (
            <div key={vendor} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: '0.8rem', color: '#94a3b8' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
              {vendor}
            </div>
          ))}
        </div>
      </div>

      {/* ── Graph Canvas ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,17,23,0.7)', zIndex: 10 }}>
            <div style={{ color: '#7c3aed', fontSize: '1.2rem' }}>⏳ Loading graph...</div>
          </div>
        )}

        {error && (
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: '#7f1d1d', color: '#fca5a5', padding: '0.5rem 1.5rem', borderRadius: 8, zIndex: 20 }}>
            ❌ {error}
          </div>
        )}

        {elements.length === 0 && !loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🕸️</div>
            <div>No graph data. <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', textDecoration: 'underline' }}>Upload files</button> first.</div>
          </div>
        )}

        {elements.length > 0 && (
          <CytoscapeComponent
            elements={elements}
            style={{ width: '100%', height: '100%' }}
            stylesheet={CY_STYLE}
            layout={LAYOUT_OPTIONS[selectedLayout] || LAYOUT_OPTIONS['cose-bilkent']}
            cy={(cy) => {
              cyRef.current = cy;
              // Node tap → show panel
              cy.on('tap', 'node', (evt) => {
                const node = evt.target;
                const pos = evt.renderedPosition;
                setNodePanel({
                  node: node.data() as GraphNode,
                  x: pos.x,
                  y: pos.y,
                });
              });
              cy.on('tap', (evt) => {
                if (evt.target === cy) setNodePanel(null);
              });
            }}
          />
        )}

        {/* Node Details Panel */}
        {nodePanel && (
          <div style={{
            position: 'absolute',
            left: Math.min(nodePanel.x + 20, window.innerWidth - 320),
            top: Math.min(nodePanel.y, window.innerHeight - 320),
            width: 280,
            background: '#1a1d27',
            border: '1px solid #334155',
            borderRadius: 10,
            padding: '1rem',
            zIndex: 30,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{(nodePanel.node as any).label || (nodePanel.node as any).hostname}</div>
              <button onClick={() => setNodePanel(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 8 }}>
              Vendor: <span style={{ color: '#e2e8f0' }}>{(nodePanel.node as any).vendor}</span>
              {(nodePanel.node as any).model && <> · Model: <span style={{ color: '#e2e8f0' }}>{(nodePanel.node as any).model}</span></>}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#7c3aed', marginBottom: 4, textTransform: 'uppercase' }}>Interfaces</div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {((nodePanel.node as any).interfaces || []).map((iface: any) => (
                <div key={iface.id} style={{ padding: '4px 0', borderBottom: '1px solid #1e293b', fontSize: '0.8rem' }}>
                  <div style={{ color: '#e2e8f0' }}>{iface.name}</div>
                  <div style={{ color: '#64748b' }}>{(iface.ips || []).join(', ')}</div>
                  {iface.zone && <div style={{ color: '#0e7490' }}>Zone: {iface.zone}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Zoom Controls */}
        <div style={{ position: 'absolute', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 20 }}>
          {[['🔍+', () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)], ['🔍−', () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)], ['⟲', () => cyRef.current?.fit()]].map(([label, fn]) => (
            <button key={label as string} onClick={fn as () => void}
              style={{ background: '#1a1d27', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', width: 40, height: 40, cursor: 'pointer', fontSize: '1rem' }}>
              {label as string}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
