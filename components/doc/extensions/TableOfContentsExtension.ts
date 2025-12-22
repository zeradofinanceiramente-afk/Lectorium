
import { Node, ReactNodeViewRenderer } from '@tiptap/react';
import { TableOfContentsNode } from './TableOfContentsNode';

export const TableOfContentsExtension = Node.create({
  name: 'tableOfContents',

  group: 'block',

  atom: true,

  parseHTML() {
    return [
      {
        tag: 'toc',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['toc', HTMLAttributes]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsNode)
  },
  
  addCommands() {
    return {
      insertTableOfContents: () => ({ chain }: any) => {
        return chain().insertContent({ type: 'tableOfContents' }).run()
      },
    } as any
  },
});
