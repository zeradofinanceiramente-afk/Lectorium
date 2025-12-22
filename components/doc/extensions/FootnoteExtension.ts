
import { Node, mergeAttributes } from '@tiptap/react';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';

export interface FootnoteOptions {
  HTMLAttributes: Record<string, any>;
}

// Fix: Remove generic <FootnoteOptions>
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
        default: 1,
        parseHTML: element => parseInt(element.getAttribute('data-id') || '1'),
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
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-footnote': '' }),
      `[${node.attrs.id}]`,
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('footnote-renumbering'),
        appendTransaction: (transactions, oldState, newState) => {
          // Check if any transaction modified the document structure
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          let modified = false;
          const tr = newState.tr;
          let counter = 1;

          // Scan the document for footnotes and ensure IDs are sequential
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
        ({ chain, state }: any) => {
          // Calculate the correct next ID based on cursor position
          // This avoids the renumbering plugin from modifying *this* node immediately, 
          // which preserves the selection and ensures the bubble menu opens.
          let countBefore = 0;
          state.doc.descendants((node: any, pos: number) => {
             if (node.type.name === this.name && pos < state.selection.from) {
                 countBefore++;
             }
          });
          const nextId = countBefore + 1;

          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                id: nextId, 
                content: '',
              },
            })
            // Select the inserted node to open the bubble menu
            .command(({ tr, dispatch }: any) => {
              if (dispatch) {
                const { selection } = tr;
                const nodeBefore = selection.$from.nodeBefore;
                if (nodeBefore && nodeBefore.type.name === this.name) {
                  const pos = selection.from - nodeBefore.nodeSize;
                  tr.setSelection(NodeSelection.create(tr.doc, pos));
                  return true;
                }
              }
              return false;
            })
            .run();
        },
    } as any;
  },
});
