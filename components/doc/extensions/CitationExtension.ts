
import { Node, ReactNodeViewRenderer } from '@tiptap/react';
import { CitationNode } from './CitationNode';

export const CitationExtension = Node.create({
  name: 'citation',

  group: 'inline',

  inline: true,

  atom: true,

  addAttributes() {
    return {
      referenceId: {
        default: null,
      },
      label: {
        default: '(REF)',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'citation-node',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['citation-node', HTMLAttributes];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CitationNode);
  },

  addCommands() {
    return {
      insertCitation: (referenceId: string, label: string) => ({ chain }: any) => {
        return chain()
          .insertContent({
            type: this.name,
            attrs: { referenceId, label },
          })
          .insertContent(' ') // Add space after
          .run();
      },
    } as any;
  },
});
