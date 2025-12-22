
import { Node, mergeAttributes } from '@tiptap/react';

export const ColumnsExtension = Node.create({
  name: 'columns',

  group: 'block',

  content: 'paragraph+',

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: element => element.style.columnCount || 2,
        renderHTML: attributes => ({
          style: `column-count: ${attributes.count}; column-gap: 2rem;`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columns' }), 0];
  },

  addCommands() {
    return {
      setColumns: (count: number) => ({ commands }: any) => {
        return commands.wrapIn('columns', { count });
      },
      unsetColumns: () => ({ commands }: any) => {
        return commands.lift('columns');
      },
    } as any;
  },
});
