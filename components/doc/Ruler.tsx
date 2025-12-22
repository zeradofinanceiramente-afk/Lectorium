
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { CM_TO_PX } from './constants';

interface RulerProps {
  editor: Editor | null;
  marginLeft: number; // Page margin in cm
  marginRight: number; // Page margin in cm
  width: number; // Page width in px
}

// Helper: Parse dimension string to pixels
const parseToPx = (val: string | null | undefined): number => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (val.endsWith('px')) return parseFloat(val);
  if (val.endsWith('cm')) return parseFloat(val) * CM_TO_PX;
  if (val.endsWith('pt')) return parseFloat(val) * (96/72); // Approx conversion
  return parseFloat(val) || 0;
};

export const Ruler: React.FC<RulerProps> = ({ editor, marginLeft, marginRight, width }) => {
  // Page Margins in PX
  const pageMarginLeftPx = marginLeft * CM_TO_PX;
  const pageMarginRightPx = marginRight * CM_TO_PX;
  
  // Interactive State (Paragraph indents)
  const [paraLeftMargin, setParaLeftMargin] = useState(0);
  const [paraFirstLineIndent, setParaFirstLineIndent] = useState(0);
  const [paraRightMargin, setParaRightMargin] = useState(0);
  
  // Dragging State
  const [isDragging, setIsDragging] = useState<'left' | 'firstLine' | 'right' | null>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  // Sync with Editor Selection
  useEffect(() => {
    if (!editor) return;

    const updateMarkers = () => {
      const { selection } = editor.state;
      let node = editor.state.doc.nodeAt(selection.from);
      if (!node || node.isText) {
          node = editor.state.doc.resolve(selection.from).parent;
      }
      
      if (node) {
        const ml = parseToPx(node.attrs.marginLeft || '0');
        const mr = parseToPx(node.attrs.marginRight || '0');
        const ti = parseToPx(node.attrs.textIndent || '0');
        
        setParaLeftMargin(ml);
        setParaRightMargin(mr);
        setParaFirstLineIndent(ti);
      }
    };

    updateMarkers();
    editor.on('selectionUpdate', updateMarkers);
    editor.on('transaction', updateMarkers);
    editor.on('update', updateMarkers);

    return () => {
      editor.off('selectionUpdate', updateMarkers);
      editor.off('transaction', updateMarkers);
      editor.off('update', updateMarkers);
    };
  }, [editor]);

  // Handle Dragging Logic
  const handleMouseDown = (e: React.MouseEvent, type: 'left' | 'firstLine' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(type);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !rulerRef.current) return;

    const rect = rulerRef.current.getBoundingClientRect();
    // Fallback para evitar divisão por zero ou escala errada
    const visualWidth = rect.width || width;
    const scaleFactor = visualWidth / width; 
    const relativeX = (e.clientX - rect.left) / scaleFactor;

    const maxLeft = width - pageMarginRightPx - paraRightMargin - 20; 
    const minRight = pageMarginLeftPx + paraLeftMargin + 20;

    if (isDragging === 'firstLine') {
      const zeroPoint = pageMarginLeftPx + paraLeftMargin;
      let newIndent = relativeX - zeroPoint;
      setParaFirstLineIndent(newIndent);
    } 
    else if (isDragging === 'left') {
      let newMargin = relativeX - pageMarginLeftPx;
      newMargin = Math.max(0, Math.min(newMargin, maxLeft));
      setParaLeftMargin(newMargin);
    }
    else if (isDragging === 'right') {
      let newMargin = width - pageMarginRightPx - relativeX;
      newMargin = Math.max(0, Math.min(newMargin, width - minRight));
      setParaRightMargin(newMargin);
    }

  }, [isDragging, width, pageMarginLeftPx, pageMarginRightPx, paraLeftMargin, paraRightMargin]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && editor) {
      if (isDragging === 'firstLine') {
        editor.chain().focus().updateAttributes('paragraph', { textIndent: `${Math.round(paraFirstLineIndent)}px` }).run();
      } else if (isDragging === 'left') {
        editor.chain().focus().updateAttributes('paragraph', { marginLeft: `${Math.round(paraLeftMargin)}px` }).run();
      } else if (isDragging === 'right') {
        editor.chain().focus().updateAttributes('paragraph', { marginRight: `${Math.round(paraRightMargin)}px` }).run();
      }
    }
    setIsDragging(null);
  }, [isDragging, editor, paraFirstLineIndent, paraLeftMargin, paraRightMargin]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Visual Positions
  const posLeftMarker = pageMarginLeftPx + paraLeftMargin;
  const posFirstLineMarker = posLeftMarker + paraFirstLineIndent;
  const posRightMarker = width - pageMarginRightPx - paraRightMargin;

  // Render Scientific Ticks
  const renderTicks = () => {
    const ticks = [];
    const totalCm = Math.floor(width / CM_TO_PX);
    
    // Content Area Bounds
    const contentStartPx = pageMarginLeftPx;
    const contentEndPx = width - pageMarginRightPx;

    for (let i = 0; i <= totalCm; i++) {
        const pos = i * CM_TO_PX;
        
        // Determine if inside margin (Highlight with Brand Color) or Body (Text Sec)
        const isMargin = pos < contentStartPx || pos > contentEndPx;
        const tickClass = isMargin ? 'border-brand text-brand' : 'border-text-sec/50 text-text-sec/70';
        
        // Relative Zero Logic (Horizontal)
        // 0 aligns with Content Start (pageMarginLeftPx)
        const relativeVal = Math.round((pos - contentStartPx) / CM_TO_PX);
        const displayVal = Math.abs(relativeVal);
        
        const fontClass = displayVal === 0 ? 'font-bold' : (isMargin ? 'font-bold' : 'font-normal');

        // Major Tick (CM)
        ticks.push(
          <div 
            key={`maj-${i}`} 
            className={`absolute top-0 h-full border-l flex flex-col justify-end pointer-events-none transition-colors duration-300 ${tickClass}`}
            style={{ 
                left: pos, 
                height: '100%',
                borderLeftWidth: '1px'
            }}
          >
             <span 
                className={`text-[9px] font-mono ml-1 mb-1.5 select-none transition-all duration-300 ${fontClass}`} 
             >
                 {displayVal}
             </span>
          </div>
        );
        
        // Minor Ticks (0.5cm)
        if (i < totalCm) {
           const subPos = pos + (0.5 * CM_TO_PX);
           // Check mid-point margin status
           const isSubMargin = subPos < contentStartPx || subPos > contentEndPx;
           const subTickClass = isSubMargin ? 'border-brand' : 'border-text-sec/30';
           const subOpacity = isSubMargin ? 'opacity-100' : 'opacity-50';

           ticks.push(
               <div 
                key={`min-${i}`} 
                className={`absolute bottom-0 h-1.5 border-l transition-colors duration-300 ${subTickClass} ${subOpacity}`}
                style={{ 
                    left: subPos, 
                }} 
               />
           );
        }
    }
    return ticks;
  };

  return (
    <div 
        ref={rulerRef}
        className="h-[24px] relative select-none shadow-sm border-b border-border z-30 bg-surface"
        style={{ width: width }}
        onMouseDown={(e) => e.preventDefault()}
    >
        {/* Margin Backgrounds */}
        <div 
            className="absolute top-0 bottom-0 pointer-events-none bg-brand opacity-5" 
            style={{ 
                left: 0, 
                width: pageMarginLeftPx,
            }} 
        />
        <div 
            className="absolute top-0 bottom-0 pointer-events-none bg-brand opacity-5" 
            style={{ 
                right: 0, 
                width: pageMarginRightPx,
            }} 
        />

        {renderTicks()}

        {/* Guide Line */}
        {isDragging && (
        <div 
            className="absolute top-[24px] w-px h-[200vh] border-l border-dashed z-50 pointer-events-none border-brand opacity-80"
            style={{ 
                left: isDragging === 'firstLine' ? posFirstLineMarker : isDragging === 'left' ? posLeftMarker : posRightMarker,
            }}
        />
        )}

        {/* --- MARKERS (Themed) --- */}

        {/* 1. First Line Indent (Top Pip) */}
        <div 
            className="absolute top-0 w-3 h-3 cursor-col-resize z-40 group hover:scale-125 transition-transform"
            style={{ left: posFirstLineMarker, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => handleMouseDown(e, 'firstLine')}
            title="Recuo da primeira linha"
        >
            <div className="w-full h-full bg-brand shadow-sm border border-black/20" style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
        </div>

        {/* 2. Left Indent (Bottom Pip) */}
        <div 
            className="absolute bottom-0 w-3 h-4 cursor-col-resize z-40 group flex flex-col items-center hover:scale-125 transition-transform"
            style={{ left: posLeftMarker, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => handleMouseDown(e, 'left')}
            title="Recuo à esquerda"
        >
            <div className="w-3 h-3 bg-brand shadow-sm border border-black/20 mb-[1px]" style={{ clipPath: 'polygon(50% 0, 0 100%, 100% 100%)' }} />
            <div className="w-3 h-1 bg-brand" />
        </div>

        {/* 3. Right Indent (Bottom Pip) */}
        <div 
            className="absolute bottom-0 w-3 h-3 cursor-col-resize z-40 group hover:scale-125 transition-transform"
            style={{ left: posRightMarker, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => handleMouseDown(e, 'right')}
            title="Recuo à direita"
        >
            <div className="w-full h-full bg-brand shadow-sm border border-black/20" style={{ clipPath: 'polygon(50% 0, 0 100%, 100% 100%)' }} />
        </div>

    </div>
  );
};
