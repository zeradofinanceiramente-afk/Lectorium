
import { Node, mergeAttributes } from '@tiptap/react';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';

export interface FootnoteOptions {
  HTMLAttributes: Record<string, any>;
}

export const FootnoteExtension = Node.create({
  name: 'footnote',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'footnote-ref',
      },
    };
  },

  addAttributes() {
    return {
      id: {
        default: 0, // Inicia com 0, o plugin corrigirá para 1, 2, 3...
        parseHTML: element => parseInt(element.getAttribute('data-id') || '0'),
        renderHTML: attributes => ({
          'data-id': attributes.id,
        }),
      },
      content: {
        default: '',
        parseHTML: element => element.getAttribute('data-content') || '',
        renderHTML: attributes => ({
          'data-content': attributes.content,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'sup[data-footnote]',
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'sup',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 
          'data-footnote': '',
          'style': 'cursor: pointer; color: var(--brand); font-weight: bold; vertical-align: super; font-size: 0.7em;'
      }),
      `${node.attrs.id > 0 ? node.attrs.id : '?'}`, // Mostra ? temporariamente se ID for 0
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('footnote-renumbering'),
        appendTransaction: (transactions, oldState, newState) => {
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          let modified = false;
          const tr = newState.tr;
          let counter = 1;

          // Varre o documento para garantir numeração sequencial (1, 2, 3...)
          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'footnote') {
              if (node.attrs.id !== counter) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  id: counter,
                });
                modified = true;
              }
              counter++;
            }
          });

          return modified ? tr : null;
        },
      }),
    ];
  },

  addCommands() {
    return {
      setFootnote:
        () =>
        ({ state, dispatch }: any) => {
          const { schema, tr } = state;
          const type = schema.nodes[this.name];
          
          if (!type) return false;

          // Cria o nó com ID 0. O plugin de renumeração ajustará o ID automaticamente.
          const node = type.create({ id: 0, content: '' });
          
          if (dispatch) {
            const { from } = state.selection;
            
            // 1. Insere o nó na posição do cursor
            tr.insert(from, node);
            
            // 2. Força a seleção do nó recém-criado (NodeSelection)
            // Isso é CRÍTICO para que o BubbleMenu detecte 'isActive' e abra.
            const selection = NodeSelection.create(tr.doc, from);
            tr.setSelection(selection);
            
            // 3. Rola até a visualização
            tr.scrollIntoView();
            
            dispatch(tr);
          }
          
          return true;
        },
    } as any;
  },
});
