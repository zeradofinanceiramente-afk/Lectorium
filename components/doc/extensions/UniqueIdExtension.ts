
import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { v4 as uuidv4 } from 'uuid';

/**
 * Custom UniqueID Extension (Free Alternative)
 * Atribui IDs únicos a blocos de texto. Essencial para:
 * 1. Colaboração (Yjs precisa rastrear nós)
 * 2. Paginação Incremental (Saber qual nó mudou de tamanho sem recalcular tudo)
 */
export const UniqueIdExtension = Extension.create({
  name: 'uniqueId',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'blockquote', 'image', 'table', 'codeBlock'],
      attributeName: 'id',
      generateID: () => uuidv4(),
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          [this.options.attributeName]: {
            default: null,
            parseHTML: element => element.getAttribute(`data-${this.options.attributeName}`),
            renderHTML: attributes => {
              if (!attributes[this.options.attributeName]) {
                return {};
              }
              return {
                [`data-${this.options.attributeName}`]: attributes[this.options.attributeName],
              };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('uniqueId'),
        appendTransaction: (transactions, oldState, newState) => {
          // Verifica se houve mudança na estrutura do documento
          const docChanged = transactions.some(transaction => transaction.docChanged);
          if (!docChanged) {
            return;
          }

          const tr = newState.tr;
          let modified = false;

          // Varre o documento procurando nós dos tipos configurados sem ID
          newState.doc.descendants((node, pos) => {
            if (
              this.options.types.includes(node.type.name) &&
              node.attrs[this.options.attributeName] === null
            ) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                [this.options.attributeName]: this.options.generateID(),
              });
              modified = true;
            }
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
