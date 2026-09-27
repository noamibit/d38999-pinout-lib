export type Anchor = 'start' | 'middle' | 'end';

export interface TextPlacement {
  x: number;
  y: number;
  size?: number;
  anchor?: Anchor;
  rotate?: number;
}

export interface Contact {
  label: string;
  cx: number;
  cy: number;
  r: number;
  style?: 'hollow' | 'filled';
  text?: TextPlacement;
}

export type Shape =
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; width?: number }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: boolean; width?: number }
  | { type: 'path'; d: string; fill?: boolean; width?: number };

export interface Annotation extends TextPlacement {
  text: string;
}

export type Status = 'draft' | 'approved' | 'rejected';

export interface Arrangement {
  schemaVersion: 1;
  id: string;
  family: string;
  prefix: string;
  number: string;
  title?: string;
  viewCaption?: string | null;
  expectedContacts?: number | null;
  canvas: { width: number; height: number };
  insert?: { cx: number; cy: number; r: number } | null;
  contacts: Contact[];
  shapes?: Shape[];
  annotations?: Annotation[];
  source?: { file?: string | null; sha256?: string | null; ref?: string | null } | null;
  qa?: { confidence?: number | null; warnings?: string[] } | null;
  status: Status;
  revision: number;
  series?: string | null;
  manufacturer?: string | null;
  partNumbers?: string[];
  shell?: string | null;
  notes?: string | null;
  tags?: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface IndexItem {
  id: string;
  prefix: string;
  number: string;
  title: string;
  svg: string;
  svgMirror: string;
  viewCaption: string | null;
  contacts: number;
}

export interface LibraryIndex {
  schemaVersion: 1;
  libraryVersion: string;
  builtAt: string;
  families: { id: string; title: string; items: IndexItem[] }[];
}
