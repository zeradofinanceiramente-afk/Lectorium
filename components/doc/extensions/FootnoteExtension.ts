
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
        default: 0, 
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
      `${node.attrs.id > 0 ? node.attrs.id : '?'}`, 
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
        (attributes?: { content: string }) =>
        ({ state, dispatch }: any) => {
          const { schema, tr } = state;
          const type = schema.nodes[this.name];
          
          if (!type) return false;

          const node = type.create({ id: 0, content: attributes?.content || '' });
          
          if (dispatch) {
            const { from } = state.selection;
            tr.insert(from, node);
            const selection = NodeSelection.create(tr.doc, from);
            tr.setSelection(selection);
            tr.scrollIntoView();
            dispatch(tr);
          }
          
          return true;
        },
    } as any;
  },
});
