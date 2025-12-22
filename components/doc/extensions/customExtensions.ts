
import { Node as TiptapNode, Extension, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Blockquote } from '@tiptap/extension-blockquote';
import { Heading } from '@tiptap/extension-heading'; // Import Heading
import MathNode from './MathNode'; // React Component
import MermaidNode from './MermaidNode'; // React Component
import { QrCodeNodeView } from './QrCodeNodeView'; // Keep vanilla for QR for now or switch if needed
export { SectionBreak } from './SectionBreak';
export { CitationExtension } from './CitationExtension';
export { CodeBlockExtension } from './CodeBlockExtension';
export { SuggestionAddition, SuggestionDeletion } from './SuggestionExtension';
export { ChartExtension } from './ChartExtension';
export { ColumnsExtension } from './ColumnsExtension';
export { UniqueIdExtension } from './UniqueIdExtension';
export { TrailingNodeExtension } from './TrailingNodeExtension';

// --- EXTENSÃO DE CITAÇÃO ABNT (Blockquote Customizado) ---
export const ABNTBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      style: {
        default: null,
        // Força os estilos ABNT: Recuo 4cm, Fonte 10pt, Espaçamento simples, Margens verticais 1.5cm
        renderHTML: () => ({
          style: 'margin-left: 4cm; font-size: 10pt; line-height: 1.0; margin-top: 1.5cm; margin-bottom: 1.5cm; font-family: "Times New Roman", Times, serif;',
        }),
      },
    }
  },
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  }
});

// --- EXTENSÃO DE TÍTULO AVANÇADO (HeadingExtended - ABNT) ---
export const HeadingExtended = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      styleId: {
        default: null,
        parseHTML: element => element.getAttribute('data-style-id'),
        renderHTML: attributes => attributes.styleId ? { 'data-style-id': attributes.styleId } : {},
      },
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => attributes.id ? { 'data-id': attributes.id } : {},
      },
      textAlign: {
        default: 'left',
        parseHTML: element => element.style.textAlign || 'left',
        renderHTML: attributes => ({ style: `text-align: ${attributes.textAlign}` }),
      },
      marginTop: {
        default: null,
        parseHTML: element => element.style.marginTop || null,
        renderHTML: attributes => attributes.marginTop ? { style: `margin-top: ${attributes.marginTop}` } : {},
      },
      marginBottom: {
        default: null,
        parseHTML: element => element.style.marginBottom || null,
        renderHTML: attributes => attributes.marginBottom ? { style: `margin-bottom: ${attributes.marginBottom}` } : {},
      },
      marginLeft: {
        default: null,
        parseHTML: element => element.style.marginLeft || null,
        renderHTML: attributes => attributes.marginLeft ? { style: `margin-left: ${attributes.marginLeft}` } : {},
      },
      marginRight: {
        default: null,
        parseHTML: element => element.style.marginRight || null,
        renderHTML: attributes => attributes.marginRight ? { style: `margin-right: ${attributes.marginRight}` } : {},
      },
      textIndent: {
        default: null,
        parseHTML: element => element.style.textIndent || null,
        renderHTML: attributes => attributes.textIndent ? { style: `text-indent: ${attributes.textIndent}` } : {},
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const level = node.attrs.level;
    const hasExplicitFontSize = !!node.attrs.fontSize; // Check if custom font size was applied via extension

    // Padrão ABNT NBR 6024 para Títulos:
    // Fonte 12, Times New Roman, Cor Preta
    // Nível 1: Negrito + Caixa Alta
    // Nível 2: Normal + Caixa Alta (Algumas normas usam Negrito, aqui definimos um padrão limpo)
    // Nível 3: Negrito + Caixa Baixa
    // Nível 4: Normal + Caixa Baixa
    // Nível 5: Itálico + Caixa Baixa
    
    // A base: Times, 12pt, Preto
    let style = 'font-family: "Times New Roman", Times, serif; color: #000000; line-height: 1.5;';
    
    // Se não houver tamanho de fonte explícito definido pelo usuário, forçamos 12pt
    if (!hasExplicitFontSize) {
        style += 'font-size: 12pt;';
    }

    switch (level) {
        case 1:
            style += 'font-weight: bold; text-transform: uppercase; margin-top: 12pt; margin-bottom: 12pt;';
            break;
        case 2:
            // Algumas instituições pedem negrito, outras normal. O padrão genérico ABNT sugere distinção clara.
            // Usaremos Negrito para visibilidade, mas a extensão permite override.
            style += 'font-weight: bold; text-transform: uppercase; margin-top: 12pt; margin-bottom: 12pt;';
            break;
        case 3:
            style += 'font-weight: bold; margin-top: 12pt; margin-bottom: 6pt;';
            break;
        case 4:
            style += 'font-weight: normal; font-style: normal; margin-top: 12pt; margin-bottom: 6pt;';
            break;
        case 5:
            style += 'font-weight: normal; font-style: italic; margin-top: 12pt; margin-bottom: 6pt;';
            break;
    }

    return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { style }), 0];
  },
});

// --- EXTENSÃO DE PARÁGRAFO AVANÇADO ---
export const ParagraphExtended = Paragraph.extend({
  addAttributes() {
    return {
      styleId: {
        default: null,
        parseHTML: element => element.getAttribute('data-style-id'),
        renderHTML: attributes => attributes.styleId ? { 'data-style-id': attributes.styleId } : {},
      },
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => attributes.id ? { 'data-id': attributes.id } : {},
      },
      textAlign: {
        default: 'justify',
        parseHTML: element => element.style.textAlign || 'justify',
        renderHTML: attributes => attributes.textAlign === 'justify' ? {} : { style: `text-align: ${attributes.textAlign}` },
      },
      marginTop: {
        default: null,
        parseHTML: element => element.style.marginTop || null,
        renderHTML: attributes => attributes.marginTop ? { style: `margin-top: ${attributes.marginTop}` } : {},
      },
      marginBottom: {
        default: null,
        parseHTML: element => element.style.marginBottom || null,
        renderHTML: attributes => attributes.marginBottom ? { style: `margin-bottom: ${attributes.marginBottom}` } : {},
      },
      marginLeft: {
        default: null,
        parseHTML: element => element.style.marginLeft || null,
        renderHTML: attributes => attributes.marginLeft ? { style: `margin-left: ${attributes.marginLeft}` } : {},
      },
      marginRight: {
        default: null,
        parseHTML: element => element.style.marginRight || null,
        renderHTML: attributes => attributes.marginRight ? { style: `margin-right: ${attributes.marginRight}` } : {},
      },
      textIndent: {
        default: null,
        parseHTML: element => element.style.textIndent || null,
        renderHTML: attributes => attributes.textIndent ? { style: `text-indent: ${attributes.textIndent}` } : {},
      },
      keepLinesTogether: {
        default: false,
        parseHTML: element => element.style.breakInside === 'avoid' || element.style.pageBreakInside === 'avoid',
        renderHTML: attributes => attributes.keepLinesTogether ? { style: 'break-inside: avoid; page-break-inside: avoid;' } : {},
      },
      keepWithNext: {
        default: false,
        parseHTML: element => element.getAttribute('data-keep-next') === 'true',
        renderHTML: attributes => attributes.keepWithNext ? { 'data-keep-next': 'true' } : {},
      },
      widowControl: {
        default: true,
        parseHTML: element => element.style.widows !== '1',
        renderHTML: attributes => !attributes.widowControl ? { style: 'widows: 1; orphans: 1;' } : {},
      },
      pageBreakBefore: {
        default: false,
        parseHTML: element => element.style.breakBefore === 'page' || element.style.pageBreakBefore === 'always',
        renderHTML: attributes => attributes.pageBreakBefore ? { style: 'break-before: page; page-break-before: always;' } : {},
      },
    };
  },
});

export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => {
              const raw = element.style.fontSize;
              if (!raw) return null;
              if (raw.endsWith('pt')) return raw.replace('pt', '');
              if (raw.endsWith('px')) {
                const px = parseFloat(raw);
                const pt = Math.round(px * 0.75); 
                return String(pt);
              }
              return raw;
            },
            renderHTML: attributes => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}pt` } : {},
          },
        },
    }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }: any) => chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }: any) => chain().setMark('textStyle', { fontSize: null }).run(),
    } as any;
  },
});

export const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() { return { types: ['heading', 'paragraph'], defaultLineHeight: '1.5' }; },
  addGlobalAttributes() {
    return [{
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: this.options.defaultLineHeight,
            parseHTML: element => element.style.lineHeight || this.options.defaultLineHeight,
            renderHTML: attributes => attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
          },
        },
    }];
  },
  addCommands() {
    return {
      setLineHeight: (lineHeight: string) => ({ commands }: any) => 
        commands.updateAttributes('paragraph', { lineHeight }) || commands.updateAttributes('heading', { lineHeight }),
    } as any;
  },
});

export const Indent = Extension.create({
  name: 'indent',
  addOptions() { return { types: ['paragraph', 'heading', 'bulletList', 'orderedList'], indentSize: 20, maxIndent: 200 }; },
  addGlobalAttributes() {
    return [{
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: element => {
               const ml = element.style.marginLeft;
               if (!ml) return 0;
               if (ml.endsWith('px')) return parseInt(ml);
               if (ml.endsWith('pt')) return parseInt(ml) * 1.33;
               return parseInt(ml) || 0;
            },
            renderHTML: attributes => attributes.indent ? { style: `margin-left: ${attributes.indent}px` } : {},
          },
        },
    }];
  },
  addCommands() {
    return {
      indent: () => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        if (!selection) return false;
        tr.doc.nodesBetween(selection.from, selection.to, (node: any, pos: any) => {
           if (this.options.types.includes(node.type.name)) {
               const currentIndent = node.attrs.indent || 0;
               const newIndent = Math.min(currentIndent + this.options.indentSize, this.options.maxIndent);
               if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: newIndent });
           }
        });
        return true;
      },
      outdent: () => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        if (!selection) return false;
        tr.doc.nodesBetween(selection.from, selection.to, (node: any, pos: any) => {
           if (this.options.types.includes(node.type.name)) {
               const currentIndent = node.attrs.indent || 0;
               const newIndent = Math.max(currentIndent - this.options.indentSize, 0);
               if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: newIndent });
           }
        });
        return true;
      },
    } as any;
  },
  addKeyboardShortcuts() {
    return {
      'Tab': () => (this.editor.commands as any).indent(),
      'Shift-Tab': () => (this.editor.commands as any).outdent(),
    };
  },
});

export const PageBreak = TiptapNode.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  parseHTML() { return [{ tag: 'hr[data-page-break]' }]; },
  renderHTML() { return ['hr', { 'data-page-break': '' }]; },
  addCommands() {
    return {
      setPageBreak: () => ({ chain }: any) => chain().insertContent({ type: 'pageBreak' }).run(),
    } as any;
  },
});

export const FootnoteSeparator = TiptapNode.create({
  name: 'footnoteSeparator',
  group: 'block',
  atom: true,
  parseHTML() { return [{ tag: 'hr[data-footnote-sep]' }]; },
  renderHTML() { 
    return ['hr', { 'data-footnote-sep': '', style: 'width: 5cm; margin-left: 0; border: none; border-top: 1px solid black; margin-top: 24px; margin-bottom: 8px;' }]; 
  },
});

// --- ADVANCED NODES (REACT) ---

export const MathExtension = TiptapNode.create({
  name: 'mathNode',
  group: 'block',
  atom: true,
  addAttributes() { return { latex: { default: 'E = mc^2' } }; },
  parseHTML() { return [{ tag: 'math-node' }]; },
  renderHTML({ HTMLAttributes }) { return ['math-node', HTMLAttributes]; },
  addNodeView() { return ReactNodeViewRenderer(MathNode); }, // Switched to React
});

export const MermaidExtension = TiptapNode.create({
  name: 'mermaidNode',
  group: 'block',
  atom: true,
  addAttributes() { return { chart: { default: '' } }; },
  parseHTML() { return [{ tag: 'mermaid-node' }]; },
  renderHTML({ HTMLAttributes }) { return ['mermaid-node', HTMLAttributes]; },
  addNodeView() { return ReactNodeViewRenderer(MermaidNode); },
});

export const QrCodeExtension = TiptapNode.create({
  name: 'qrCodeNode',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() { return { value: { default: 'https://' } }; },
  parseHTML() { return [{ tag: 'qrcode-node' }]; },
  renderHTML({ HTMLAttributes }) { return ['qrcode-node', HTMLAttributes]; },
  // Keeping Vanilla for performance on simple canvas render
  addNodeView() { 
    return (props) => new QrCodeNodeView(props.node, props.view, props.getPos as () => number); 
  },
});
