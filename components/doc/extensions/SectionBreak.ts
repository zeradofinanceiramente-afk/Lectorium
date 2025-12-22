
import { Node, mergeAttributes } from '@tiptap/react';

export interface SectionBreakOptions {
  HTMLAttributes: Record<string, any>;
}

// Fix: Remove generic <SectionBreakOptions>
export const SectionBreak = Node.create({
  name: 'sectionBreak',

  group: 'block',

  atom: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'section-break',
      },
    };
  },

  addAttributes() {
    return {
      orientation: {
        default: 'portrait',
      },
      paperSize: {
        default: 'a4',
      },
      marginTop: { default: 2.54 },
      marginBottom: { default: 2.54 },
      marginLeft: { default: 2.54 },
      marginRight: { default: 2.54 },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="section-break"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'section-break' }), 
      ['span', { class: 'section-break-label' }, `Quebra de Seção (${HTMLAttributes.orientation === 'landscape' ? 'Paisagem' : 'Retrato'})`]
    ];
  },

  addCommands() {
    return {
      setSectionBreak: (attributes: any) => ({ chain }: any) => {
        return chain()
          .insertContent({
            type: this.name,
            attrs: attributes,
          })
          .run();
      },
    } as any;
  },
});
