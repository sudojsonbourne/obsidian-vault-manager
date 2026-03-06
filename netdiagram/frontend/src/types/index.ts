// Shared TypeScript types for frontend ↔ backend communication

export interface GraphInterface {
  id: string;
  name: string;
  ips: string[];
  speed?: string;
  vlan?: number;
  zone?: string;
  description?: string;
}

export interface GraphNode {
  id: string;
  hostname: string;
  vendor: string;
  model?: string;
  interfaces: GraphInterface[];
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  sourceInterfaceId?: string;
  targetInterfaceId?: string;
  connectionType: string;
  vlan?: number;
  speed?: string;
  // Populated by filter endpoint
  totalOccurrences?: number;
  protocols?: string[];
  ports?: number[];
  flowCount?: number;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FilterCriteria {
  interface?: string;
  zone?: string;
  ip?: string;
  protocol?: string;
  port?: number;
  minOccurrences?: number;
  showAllEdges?: boolean;
}

export interface ColumnMapping {
  sourceIP: string;
  destIP: string;
  sourcePort?: string;
  destPort?: string;
  protocol?: string;
  timestamp?: string;
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  result?: Record<string, unknown>;
  error?: string;
}
