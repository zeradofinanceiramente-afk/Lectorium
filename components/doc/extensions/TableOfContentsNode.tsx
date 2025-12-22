
import React, { useEffect, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { CM_TO_PX } from '../constants'; // Import constants for accurate calculation

interface HeadingItem {
  level: number;
  text: string;
  id: string;
  pos: number;
  page?: number;
}

export const TableOfContentsNode = (props: any) => {
  const { editor } = props;
  const [items, setItems] = useState<HeadingItem[]>([]);

  useEffect(() => {
    if (!editor) return;

    const calculatePages = () => {
      // Configuration values matched with PaginationExtension defaults or retrieved from command state
      // Default: A4 (29.7cm height), margins ~2.54cm
      const PAGE_HEIGHT_PX = 29.7 * CM_TO_PX; 
      const PAGE_GAP = 20; 
      const TOTAL_UNIT = PAGE_HEIGHT_PX + PAGE_GAP;

      const headings: HeadingItem[] = [];
      const { doc } = editor.state;

      doc.descendants((node: any, pos: number) => {
        if (node.type.name === 'heading') {
          // Generate ID if missing (for linking)
          const id = `toc-heading-${pos}`;
          
          // Calculate Page Number based on DOM position
          let page = 1;
          try {
             // We need to find the DOM element corresponding to this node position
             // Tiptap's view.nodeDOM(pos) usually gives the element
             const domNode = editor.view.nodeDOM(pos) as HTMLElement;
             if (domNode) {
                 // Get position relative to the editor content container
                 // The editor content container usually has padding-top which is the first page margin
                 // But simply using offsetTop relative to the scroll container is effective
                 const offsetTop = domNode.offsetTop;
                 page = Math.floor(offsetTop / TOTAL_UNIT) + 1;
             }
          } catch (e) {
             // Fallback if DOM calculation fails
          }

          headings.push({
            level: node.attrs.level,
            text: node.textContent,
            id,
            pos,
            page
          });
        }
      });
      setItems(headings);
    };

    // Initial load
    setTimeout(calculatePages, 500);

    // Listen to updates
    editor.on('update', calculatePages);
    
    // Also listen to a custom event for pagination recalc if available
    const handlePaginationRecalc = () => calculatePages();
    editor.view.dom.addEventListener('pagination-calculated', handlePaginationRecalc);

    return () => {
      editor.off('update', calculatePages);
      editor.view.dom.removeEventListener('pagination-calculated', handlePaginationRecalc);
    };
  }, [editor]);

  const handleJump = (pos: number) => {
    editor.chain()
      .setTextSelection(pos)
      .scrollIntoView()
      .run();
  };

  return (
    <NodeViewWrapper className="react-renderer my-4 select-none">
      <div className="p-6 rounded-lg border border-gray-300 bg-white/50">
        <h3 className="text-2xl font-bold mb-6 border-b border-gray-300 pb-3 text-black">Sumário</h3>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Adicione títulos ao documento para vê-los aqui.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <div 
                key={index}
                onClick={() => handleJump(item.pos)}
                className="group cursor-pointer flex items-baseline hover:bg-black/5 rounded px-2 py-1 transition-colors"
                style={{ marginLeft: `${(item.level - 1) * 1.5}rem` }}
              >
                <span className={`text-black group-hover:text-black ${item.level === 1 ? 'font-bold text-lg' : 'text-base'}`}>
                  {item.text || "Sem título"}
                </span>
                
                {/* Leader Dots */}
                <div className="flex-1 mx-2 border-b border-dotted border-gray-400 opacity-60 relative top-[-5px]"></div>
                
                <span className="text-sm font-medium font-mono text-gray-700 group-hover:text-black">
                   {item.page || "-"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};
