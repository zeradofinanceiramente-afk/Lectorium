
import { Image } from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageNodeView } from './ImageNodeView';

export const CustomImage = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: attributes => {
          if (!attributes.width) return {};
          return { style: `width: ${attributes.width}px` };
        },
      },
      height: {
        default: null,
      },
      rotation: {
        default: 0,
        renderHTML: attributes => {
          if (!attributes.rotation) return {};
          return { style: `transform: rotate(${attributes.rotation}deg)` };
        },
      },
      isCropping: {
        default: false,
        renderHTML: () => ({}), // Não renderiza no HTML final, é apenas estado de UI
        keepOnSplit: false,
      },
      crop: {
        default: { top: 0, right: 0, bottom: 0, left: 0 },
        renderHTML: attributes => {
          const { top, right, bottom, left } = attributes.crop || { top: 0, right: 0, bottom: 0, left: 0 };
          // Apenas adiciona o estilo se houver algum corte
          if (top === 0 && right === 0 && bottom === 0 && left === 0) return {};
          return { style: `clip-path: inset(${top}% ${right}% ${bottom}% ${left}%)` };
        },
        // Parsing simplificado
        parseHTML: element => {
          const clipPath = element.style.clipPath;
          if (clipPath && clipPath.startsWith('inset(')) {
             // Tenta extrair valores simples: inset(10% 0% 0% 0%)
             const matches = clipPath.match(/inset\((.*)\)/);
             if (matches && matches[1]) {
                const parts = matches[1].split(' ').map(p => parseFloat(p));
                if (parts.length === 4) {
                   return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
                }
             }
          }
          return { top: 0, right: 0, bottom: 0, left: 0 };
        }
      },
      title: {
        default: null,
      },
      // Melhorado: Parsing de Alinhamento para Imagens
      align: {
        default: 'center',
        parseHTML: element => {
            // 1. Checa atributo style inline (text-align, float)
            if (element.style.textAlign) return element.style.textAlign;
            if (element.style.float === 'left') return 'left';
            if (element.style.float === 'right') return 'right';
            
            // 2. Checa margens automáticas (indicativo de center)
            if (element.style.marginLeft === 'auto' && element.style.marginRight === 'auto') return 'center';

            // 3. Checa atributo HTML legado
            const alignAttr = element.getAttribute('align');
            if (alignAttr) return alignAttr;

            // 4. Fallback padrão
            return 'center';
        },
        renderHTML: attributes => {
            // Renderiza como estilo textAlign (compatível com Tiptap TextAlign extension)
            if (attributes.align === 'left') return { style: 'float: left; margin-right: 1em' };
            if (attributes.align === 'right') return { style: 'float: right; margin-left: 1em' };
            // Para center, geralmente é bloco com margem auto ou pai com text-align
            // Mas aqui deixamos o container lidar com isso ou usamos o padrão do componente
            return {}; 
        }
      },
      // Compatibilidade com a extensão TextAlign do Tiptap
      textAlign: {
        default: 'center',
        parseHTML: element => element.style.textAlign || element.getAttribute('align') || 'center',
        renderHTML: attributes => ({ style: `text-align: ${attributes.textAlign}` }),
      }
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
