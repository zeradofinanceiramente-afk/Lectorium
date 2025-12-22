
import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Quote } from 'lucide-react';

export const CitationNode = (props: any) => {
  const { node } = props;
  const label = node.attrs.label || '(REF)';

  return (
    <NodeViewWrapper className="inline-flex align-middle mx-1 select-none">
      <span 
        className="inline-flex items-center gap-1 bg-brand/10 text-brand border border-brand/30 rounded px-1.5 py-0.5 text-xs font-medium cursor-pointer hover:bg-brand/20 transition-colors"
        title="Citação Bibliográfica"
      >
        <Quote size={10} className="opacity-70" />
        {label}
      </span>
    </NodeViewWrapper>
  );
};
