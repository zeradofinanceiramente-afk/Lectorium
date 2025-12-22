
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { common, createLowlight } from 'lowlight';
import CodeBlockComponent from './CodeBlockComponent';

const lowlight = createLowlight(common);

export const CodeBlockExtension = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      title: {
        default: null,
        renderHTML: (attributes: any) => {
          if (!attributes.title) return {};
          return { 'data-title': attributes.title };
        },
        parseHTML: (element: any) => element.getAttribute('data-title'),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
}).configure({
  lowlight,
});
