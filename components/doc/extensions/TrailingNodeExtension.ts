
import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Trailing Node Extension
 * Garante que o documento sempre termine com um parágrafo de texto.
 * Isso evita que o usuário fique "preso" se o último elemento for uma tabela,
 * imagem ou quebra de página (comum no modo paginado).
 */
export const TrailingNodeExtension = Extension.create({
  name: 'trailingNode',

  addOptions() {
    return {
      node: 'paragraph',
      notAfter: ['paragraph'],
    };
  },

  addProseMirrorPlugins() {
    const plugin = new PluginKey(this.name);
    const disabledNodes = this.options.notAfter;

    return [
      new Plugin({
        key: plugin,
        appendTransaction: (_, __, state) => {
          const { doc, tr, schema } = state;
          const shouldInsertNodeAtEnd = plugin.getState(state);
          const endPosition = doc.content.size;
          const type = schema.nodes[this.options.node];

          if (!shouldInsertNodeAtEnd) {
            return;
          }

          return tr.insert(endPosition, type.create());
        },
        state: {
          init: (_, state) => {
            const lastNode = state.doc.lastChild;
            return lastNode ? !disabledNodes.includes(lastNode.type.name) : false;
          },
          apply: (tr, value) => {
            if (!tr.docChanged) {
              return value;
            }

            const lastNode = tr.doc.lastChild;
            return lastNode ? !disabledNodes.includes(lastNode.type.name) : false;
          },
        },
      }),
    ];
  },
});
