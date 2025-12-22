
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

    // Helper to get relative Y position
    const getRelativeY = (pos: number) => {
        try {
            // view.coordsAtPos gives viewport coordinates
            const coords = view.coordsAtPos(pos);
            const domRect = view.dom.getBoundingClientRect();
            // Calculate offset relative to the top of the editor content
            // We use Math.abs to handle potential negative scroll offsets if any
            return coords.top - domRect.top + view.dom.scrollTop;
        } catch (e) {
            return -1;
        }
    };

    const totalPageUnit = pageHeight + pageGap;

    doc.descendants((node, pos) => {
      if (node.type.name === 'footnote') {
        const id = node.attrs.id;
        const content = node.attrs.content || '';
        
        // Calculate Page Index
        // Note: coordsAtPos relies on the browser layout. 
        // If content is not rendered (lazy), this might be inaccurate, 
        // but for visible pages it works.
        const relativeY = getRelativeY(pos);
        
        if (relativeY >= 0) {
            // Determine page index (0-based)
            const pageIndex = Math.floor(relativeY / totalPageUnit);
            
            if (!mapping[pageIndex]) mapping[pageIndex] = [];
            mapping[pageIndex].push({ id, content, pos });
        }
      }
    });

    // Sort footnotes by ID to ensure order (though usually document order matches ID order)
    Object.keys(mapping).forEach(key => {
        const pageIdx = parseInt(key);
        mapping[pageIdx].sort((a, b) => a.id - b.id);
    });

    setFootnotesByPage(mapping);
  }, [editor, pageHeight, pageGap]);

  useEffect(() => {
    if (!editor) return;

    // Calculate initially
    // Timeout helps ensure layout is stable after mount
    const t = setTimeout(calculateFootnotes, 500);

    // Recalculate on updates
    const handleUpdate = () => {
        // Debounce slightly for performance
        requestAnimationFrame(calculateFootnotes);
    };

    editor.on('update', handleUpdate);
    editor.on('transaction', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    
    // Listen to pagination recalc event from extension
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

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
        {Object.entries(footnotesByPage).map(([pageIndexStr, n]) => {
            const pageIndex = parseInt(pageIndexStr);
            const notes = n as FootnoteItem[];
            // Calculate Top position for the footer area of this specific page
            // Logic: Top of Page + Page Height - Margin Bottom
            // Note: We position it slightly *inside* the margin area
            const pageTop = pageIndex * (pageHeight + pageGap);
            const footerTop = pageTop + (pageHeight - marginBottomPx);

            return (
                <div 
                    key={pageIndex}
                    className="absolute flex flex-col justify-start"
                    style={{
                        top: `${footerTop}px`,
                        left: `${marginLeftPx}px`,
                        right: `${marginRightPx}px`,
                        height: `${marginBottomPx}px`,
                        // Allow clicking on footnotes
                        pointerEvents: 'auto',
                    }}
                >
                    {/* Separator */}
                    <div className="w-12 border-t border-black/80 mb-2 mt-1" />
                    
                    {/* Footnotes List */}
                    <div className="flex flex-col gap-1.5 overflow-hidden">
                        {notes.map((note) => (
                            <div key={note.id} className="flex gap-2 text-[10px] leading-tight text-black group">
                                <span 
                                    className="font-bold cursor-pointer hover:text-brand vertical-super text-[9px]"
                                    onClick={() => {
                                        editor?.chain().setTextSelection(note.pos).scrollIntoView().run();
                                    }}
                                >
                                    {note.id}
                                </span>
                                <span className="text-justify font-serif">
                                    {note.content || <i className="opacity-50 text-gray-500">Sem conteúdo...</i>}
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
