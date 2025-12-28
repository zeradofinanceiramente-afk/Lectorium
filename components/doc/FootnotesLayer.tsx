
import React, { useEffect, useState, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { CM_TO_PX } from './constants';

interface Props {
  editor: Editor | null;
  pageHeight: number;
  pageGap: number;
  marginBottom: number; // in cm
  marginLeft: number; // in cm
  marginRight: number; // in cm
}

interface FootnoteItem {
  id: number;
  content: string;
  pos: number;
}

export const FootnotesLayer: React.FC<Props> = ({ 
  editor, 
  pageHeight, 
  pageGap,
  marginBottom,
  marginLeft,
  marginRight
}) => {
  const [footnotesByPage, setFootnotesByPage] = useState<Record<number, FootnoteItem[]>>({});

  const calculateFootnotes = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;

    const { doc } = editor.state;
    const { view } = editor;
    const mapping: Record<number, FootnoteItem[]> = {};

    const getPageForPos = (pos: number) => {
        try {
            const domInfo = view.domAtPos(pos);
            const node = domInfo.node;
            const element = (node instanceof HTMLElement ? node : node.parentElement) as HTMLElement;
            
            if (!element) return -1;

            let currentEl = element;
            let offsetTop = currentEl.offsetTop;
            
            while (currentEl && currentEl !== view.dom && currentEl.offsetParent) {
                currentEl = currentEl.offsetParent as HTMLElement;
                if (currentEl.classList.contains('ProseMirror')) break;
                offsetTop += currentEl.offsetTop;
            }

            const totalPageUnit = pageHeight + pageGap;
            return Math.floor(offsetTop / totalPageUnit);

        } catch (e) {
            return -1;
        }
    };

    doc.descendants((node, pos) => {
      if (node.type.name === 'footnote') {
        const id = node.attrs.id;
        const content = node.attrs.content || '';
        
        const pageIndex = getPageForPos(pos);
        
        if (pageIndex >= 0) {
            if (!mapping[pageIndex]) mapping[pageIndex] = [];
            mapping[pageIndex].push({ id, content, pos });
        }
      }
    });

    Object.keys(mapping).forEach(key => {
        const pageIdx = parseInt(key);
        mapping[pageIdx].sort((a, b) => a.id - b.id);
    });

    setFootnotesByPage(mapping);
  }, [editor, pageHeight, pageGap]);

  useEffect(() => {
    if (!editor) return;

    const t = setTimeout(calculateFootnotes, 500);

    const handleUpdate = () => {
        requestAnimationFrame(calculateFootnotes);
    };

    editor.on('update', handleUpdate);
    editor.on('transaction', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    
    editor.view.dom.addEventListener('pagination-calculated', handleUpdate);

    return () => {
        clearTimeout(t);
        editor.off('update', handleUpdate);
        editor.off('transaction', handleUpdate);
        editor.off('selectionUpdate', handleUpdate);
        editor.view.dom.removeEventListener('pagination-calculated', handleUpdate);
    };
  }, [editor, calculateFootnotes]);

  const marginBottomPx = marginBottom * CM_TO_PX;
  const marginLeftPx = marginLeft * CM_TO_PX;
  const marginRightPx = marginRight * CM_TO_PX;
  
  // ABNT Separator
  const separatorWidthPx = 5 * CM_TO_PX; 

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
        {Object.entries(footnotesByPage).map(([pageIndexStr, n]) => {
            const pageIndex = parseInt(pageIndexStr);
            const notes = n as FootnoteItem[];
            
            // Positioning Logic:
            // Top of current page = pageIndex * (height + gap)
            // Bottom of current page (visual) = Top + Height
            // Content Area Bottom = Bottom - MarginBottom
            // We anchor the footnotes stack right ABOVE the bottom margin.
            
            const pageStartTop = pageIndex * (pageHeight + pageGap);
            const contentBottomPos = pageStartTop + pageHeight - marginBottomPx;

            return (
                <div 
                    key={pageIndex}
                    className="absolute flex flex-col justify-end pb-2"
                    style={{
                        top: `${contentBottomPos}px`, // Anchor at the bottom line of content
                        left: `${marginLeftPx}px`,
                        right: `${marginRightPx}px`,
                        // Use translate -100% to grow upwards from the anchor line
                        transform: 'translateY(-100%)', 
                        pointerEvents: 'auto',
                        maxHeight: `${pageHeight * 0.3}px` // Limit height to 30% of page to prevent overlaying too much text
                    }}
                >
                    <div 
                        className="border-t border-black mb-2 mt-1" 
                        style={{ width: `${separatorWidthPx}px` }} 
                    />
                    
                    <div className="flex flex-col gap-1 overflow-hidden">
                        {notes.map((note) => (
                            <div 
                                key={note.id} 
                                className="flex gap-2 text-[10px] leading-tight text-black group items-start text-justify"
                                style={{ 
                                    fontFamily: '"Times New Roman", Times, serif',
                                    fontSize: '10pt',
                                    lineHeight: '1.2' 
                                }}
                            >
                                <span 
                                    className="font-bold cursor-pointer hover:text-brand vertical-super shrink-0"
                                    onClick={() => {
                                        editor?.chain().setTextSelection(note.pos).scrollIntoView().run();
                                    }}
                                >
                                    {note.id}
                                </span>
                                <span>
                                    {note.content || <i className="opacity-50 text-gray-500">...</i>}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        })}
    </div>
  );
};
