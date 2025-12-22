
import { Mark, mergeAttributes } from '@tiptap/react';

export interface CommentOptions {
  HTMLAttributes: Record<string, any>;
}

// Fix: Remove generic <CommentOptions>
export const CommentExtension = Mark.create({
  name: 'comment',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'comment-mark',
      },
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: element => element.getAttribute('data-comment-id'),
        renderHTML: attributes => ({
          'data-comment-id': attributes.commentId,
          style: 'background-color: rgba(255, 215, 0, 0.3); border-bottom: 2px solid #fbbf24; cursor: pointer;',
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }: any) => {
          return commands.setMark(this.name, { commentId });
        },
      unsetComment:
        (commentId: string) =>
        ({ commands }: any) => {
          return commands.unsetMark(this.name, { commentId });
        },
    } as any;
  },
});
