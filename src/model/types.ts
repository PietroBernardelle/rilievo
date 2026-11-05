export interface Point {
  x: number;
  y: number;
}
export interface Vertex extends Point {
  id: string;
  sketch: Point;
}
export interface Room {
  id: string;
  name: string;
  vertexIds: string[];
  height: number;
}
export type EdgeRef = [string, number];
export type PointRef =
  | { vertex: string }
  | { jamb: string; side: 0 | 1 }
  | { edgePoint: EdgeRef; t: number };
export interface Wall {
  roomId: string;
  edge: number;
  thickness?: number;
  exterior?: boolean;
}
export interface Opening {
  id: string;
  roomId: string;
  edge: number;
  type: 'door' | 'window' | 'arch';
  offset: number;
  width: number;
  height: number;
  sill: number;
}
export interface Measurement {
  id: string;
  kind: 'distance' | 'height' | 'thickness' | 'offset';
  a: PointRef;
  b: PointRef;
  value: number | null;
  sigma: number;
  status: 'queued' | 'done' | 'skipped' | 'rejected';
  note: string;
}
export interface Constraint {
  kind: string;
  edges: EdgeRef[];
  weight?: number;
  hard?: boolean;
}
export interface Join {
  id: string;
  a: EdgeRef;
  b: EdgeRef;
  thickness: number;
  via: string;
}
export interface Block {
  id: string;
  name: string;
  kind: 'floor' | 'site' | 'other';
  elevation: number;
  placement: Point & { rotation: number };
  vertices: Vertex[];
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
  features: Record<string, unknown>[];
  measurements: Measurement[];
  constraints: Constraint[];
  joins: Join[];
}
export interface Link {
  id: string;
  a: { block: string; vertex: string };
  b: { block: string; vertex: string };
}
export interface Project {
  schemaVersion: 1;
  name: string;
  units: 'm';
  createdAt: string;
  settings: { tolerance: number; laserSigma: number; placementSigma: number };
  blocks: Block[];
  links: Link[];
}
