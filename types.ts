
import { User } from "firebase/auth";

export const MIME_TYPES = {
  PDF: 'application/pdf',
  FOLDER: 'application/vnd.google-apps.folder',
  GOOGLE_DOC: 'application/vnd.google-apps.document',
  GOOGLE_SHEET: 'application/vnd.google-apps.spreadsheet',
  GOOGLE_SLIDES: 'application/vnd.google-apps.presentation',
  MINDMAP: 'application/json',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  TIFF: 'image/tiff',
  HEIC: 'image/heic',
  HEIF: 'image/heif',
  WEBP: 'image/webp',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  BMP: 'image/bmp',
  GIF: 'image/gif',
  DICOM: 'application/dicom',
  CBZ: 'application/vnd.comicbook+zip',
  CBR: 'application/vnd.comicbook-rar',
  PLAIN_TEXT: 'text/plain',
  MARKDOWN: 'text/markdown',
  LEGACY_MINDMAP_EXT: '.mindmap',
  DOCX_EXT: '.docx',
  LECTORIUM: 'application/vnd.lectorium',
  LECT_EXT: '.lect'
} as const;

export type LoadingStatus = 'init' | 'downloading' | 'converting' | 'layout' | 'ready' | 'error';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  parents?: string[];
  blob?: Blob;
  starred?: boolean;
  pinned?: boolean;
  size?: string;
  modifiedTime?: string;
  handle?: any; // FileSystemFileHandle para Native File System
}

export interface Annotation {
  id?: string;
  page: number;
  bbox: [number, number, number, number];
  text?: string;
  type: 'highlight' | 'note' | 'ink';
  points?: number[][];
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  isBurned?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface SyncStatus {
  active: boolean;
  message: string | null;
  lastSyncAt?: number;
  error?: string | null;
}

export interface EditorStats {
  words: number;
  chars: number;
  charsNoSpace: number;
  readTime: number;
}

export interface AppState {
  user: User | null;
  accessToken: string | null;
  currentFile: DriveFile | null;
  view: 'login' | 'browser' | 'viewer';
}

export type ReferenceType = 'book' | 'article' | 'website';

export interface Reference {
  id: string;
  type: ReferenceType;
  title: string;
  authors: { firstName: string; lastName: string }[];
  year: string;
  publisher?: string;
  city?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  accessDate?: string;
}

export type NodeShape = 'rectangle' | 'circle' | 'diamond' | 'sticky' | 'pill' | 'hexagon';

export interface MindMapNode {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  parentId?: string;
  isRoot?: boolean;
  scale?: number;
  fontSize?: number;
  shape?: NodeShape;
  icon?: string;
  imageUrl?: string;
  imageScale?: number;
  collapsed?: boolean;
}

export interface MindMapEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

export interface MindMapViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface MindMapData {
  id?: string;
  name?: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  viewport: MindMapViewport;
  updatedAt?: string;
}

export interface SyncQueueItem {
  id: string;
  fileId: string;
  action: 'create' | 'update';
  blob: Blob;
  name: string;
  mimeType: string;
  parents?: string[];
  retryCount?: number;
  createdAt?: number;
}