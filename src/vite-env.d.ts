
// /// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Declarações de arquivos estáticos
declare module '*.svg' {
  const content: string;
  export default content;
}
declare module '*.png' {
  const content: string;
  export default content;
}
declare module '*.jpg' {
  const content: string;
  export default content;
}
declare module '*.css';

// Declaração de Workers do Vite
declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

// --- Módulos Externos ---

declare module 'mammoth';
declare module 'utif';
declare module 'heic2any';
declare module 'daikon';
declare module 'unrar-js';
declare module 'katex';
declare module 'mermaid';
declare module 'qrcode';
declare module 'recharts';
declare module 'lowlight' {
  export const common: any;
  export const createLowlight: (langs: any) => any;
}

// JSZip
declare module 'jszip' {
  export interface JSZipObject {
    name: string;
    dir: boolean;
    date: Date;
    comment: string;
    async(type: 'string'): Promise<string>;
    async(type: 'blob'): Promise<Blob>;
    async(type: 'arraybuffer'): Promise<ArrayBuffer>;
    async(type: 'base64'): Promise<string>;
    async(type: string): Promise<any>;
    nodeStream(): any;
  }

  export interface JSZipGeneratorOptions {
    type?: 'blob' | 'string' | 'base64' | 'nodebuffer' | 'uint8array' | 'arraybuffer';
    compression?: 'STORE' | 'DEFLATE';
    compressionOptions?: { level: number };
    comment?: string;
    mimeType?: string;
    platform?: 'DOS' | 'UNIX';
    encodeFileName?: (filename: string) => string;
    streamFiles?: boolean;
    onUpdate?: (metadata: any) => void;
  }

  export interface JSZipLoadOptions {
    base64?: boolean;
    checkCRC32?: boolean;
    optimizedBinaryString?: boolean;
    createFolders?: boolean;
    decodeFileName?: (bytes: string[]) => string;
  }

  class JSZip {
    constructor();
    files: { [key: string]: JSZipObject };
    file(path: string): JSZipObject | null;
    file(path: string, data: any, options?: any): this;
    folder(name: string): JSZip | null;
    forEach(callback: (relativePath: string, file: JSZipObject) => void): void;
    generateAsync(options?: JSZipGeneratorOptions): Promise<any>;
    loadAsync(data: any, options?: JSZipLoadOptions): Promise<this>;
    static loadAsync(data: any, options?: JSZipLoadOptions): Promise<JSZip>;
  }

  namespace JSZip {
    export type JSZipObject = import('jszip').JSZipObject;
  }

  export default JSZip;
}

// Google GenAI
declare module '@google/genai' {
  /**
   * OpenAPI Types for responseSchema as per @google/genai coding guidelines.
   */
  export enum Type {
    TYPE_UNSPECIFIED = 'TYPE_UNSPECIFIED',
    STRING = 'STRING',
    NUMBER = 'NUMBER',
    INTEGER = 'INTEGER',
    BOOLEAN = 'BOOLEAN',
    ARRAY = 'ARRAY',
    OBJECT = 'OBJECT',
    NULL = 'NULL',
  }

  /**
   * Modalities for responseModalities as per @google/genai coding guidelines.
   */
  export enum Modality {
    TEXT = 'TEXT',
    IMAGE = 'IMAGE',
    AUDIO = 'AUDIO',
    VIDEO = 'VIDEO',
  }

  export class GoogleGenAI {
    constructor(options: { apiKey: string });
    models: {
      generateContent: (params: any) => Promise<GenerateContentResponse>;
      generateContentStream: (params: any) => AsyncIterable<GenerateContentResponse>;
      embedContent: (params: any) => Promise<EmbedContentResponse>;
    };
    chats: {
      create: (config: any) => any;
    };
  }

  /**
   * Response structure following the SDK's latest property-based access (.text).
   */
  export interface GenerateContentResponse {
    text: string;
    candidates?: any[];
    functionCalls?: any[];
  }

  export interface EmbedContentResponse {
    embedding?: {
      values: number[];
    };
  }
}

// Tiptap Core & Extensions
declare module '@tiptap/react' {
  export * from '@tiptap/core';
  export class Editor {
    constructor(options?: any);
    chain(): any;
    can(): any;
    isActive(name: string | object, attributes?: object): boolean;
    getAttributes(name: string): any;
    getJSON(): any;
    getHTML(): string;
    getText(): string;
    isEditable: boolean;
    setEditable(editable: boolean): void;
    on(event: string, fn: Function): void;
    off(event: string, fn: Function): void;
    destroy(): void;
    state: any;
    view: any;
    storage: any;
    commands: any;
    registerPlugin(plugin: any): void;
    unregisterPlugin(name: string): void;
    isDestroyed: boolean;
  }
  export class Extension {
    static create(config: any): any;
  }
  export class Node {
    static create(config: any): any;
  }
  export class Mark {
    static create(config: any): any;
  }
  export function mergeAttributes(...args: any[]): any;
  export function useEditor(options: any, deps?: any[]): Editor | null;
  export const EditorContent: any;
  export const BubbleMenu: any;
  export const NodeViewWrapper: any;
  export const NodeViewContent: any;
  export const ReactNodeViewRenderer: any;
  export interface NodeViewProps {
    editor: Editor;
    node: any;
    decorations: any;
    selected: boolean;
    extension: any;
    getPos: () => number;
    updateAttributes: (attributes: Record<string, any>) => void;
    deleteNode: () => void;
  }
}

// Updated definitions for Named Exports in Tiptap v3
declare module '@tiptap/starter-kit' { export const StarterKit: any; }
declare module '@tiptap/extension-paragraph' { export const Paragraph: any; }
declare module '@tiptap/extension-blockquote' { export const Blockquote: any; }
declare module '@tiptap/extension-document' { export const Document: any; }
declare module '@tiptap/extension-text' { export const Text: any; }
declare module '@tiptap/extension-dropcursor' { export const Dropcursor: any; }
declare module '@tiptap/extension-gapcursor' { export const Gapcursor: any; }
declare module '@tiptap/extension-history' { export const History: any; }
declare module '@tiptap/extension-bold' { export const Bold: any; }
declare module '@tiptap/extension-italic' { export const Italic: any; }
declare module '@tiptap/extension-strike' { export const Strike: any; }
declare module '@tiptap/extension-table' { export const Table: any; }
declare module '@tiptap/extension-table-row' { export const TableRow: any; }
declare module '@tiptap/extension-table-cell' { export const TableCell: any; }
declare module '@tiptap/extension-table-header' { export const TableHeader: any; }
declare module '@tiptap/extension-underline' { export const Underline: any; }
declare module '@tiptap/extension-text-align' { export const TextAlign: any; }
declare module '@tiptap/extension-link' { export const Link: any; }
declare module '@tiptap/extension-image' { export const Image: any; }
declare module '@tiptap/extension-text-style' { export const TextStyle: any; }
declare module '@tiptap/extension-color' { export const Color: any; }
declare module '@tiptap/extension-highlight' { export const Highlight: any; }
declare module '@tiptap/extension-task-list' { export const TaskList: any; }
declare module '@tiptap/extension-task-item' { export const TaskItem: any; }
declare module '@tiptap/extension-font-family' { export const FontFamily: any; }
declare module '@tiptap/extension-subscript' { export const Subscript: any; }
declare module '@tiptap/extension-superscript' { export const Superscript: any; }
declare module '@tiptap/extension-placeholder' { export const Placeholder: any; }
declare module '@tiptap/extension-character-count' { export const CharacterCount: any; }
declare module '@tiptap/extension-typography' { export const Typography: any; }
declare module '@tiptap/extension-code-block-lowlight' { export const CodeBlockLowlight: any; }
declare module '@tiptap/extension-collaboration' { export const Collaboration: any; }
declare module '@tiptap/extension-collaboration-cursor' { export const CollaborationCursor: any; }
declare module '@tiptap/extension-bubble-menu' { 
  export const BubbleMenu: any; 
  export const Extension: any; 
}

declare module 'y-webrtc' {
  export class WebrtcProvider {
    constructor(room: string, doc: any);
    destroy(): void;
  }
}
declare module 'yjs' {
  export class Doc {
    destroy(): void;
  }
}
