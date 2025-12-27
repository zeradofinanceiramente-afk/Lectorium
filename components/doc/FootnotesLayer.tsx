
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

    // --- FIX: DOM-BASED CALCULATION ---
    // Substitui view.coordsAtPos (que quebra com CSS Transform/Scale) por view.domAtPos (offset real no documento)
    const getPageForPos = (pos: number) => {
        try {
            // Encontra o nó DOM correspondente à posição do ProseMirror
            const domInfo = view.domAtPos(pos);
            const node = domInfo.node;
            const element = (node instanceof HTMLElement ? node : node.parentElement) as HTMLElement;
            
            if (!element) return -1;

            // Calcula o offsetTop acumulado até a raiz do editor
            // Isso garante precisão mesmo dentro de tabelas ou blocos aninhados
            let currentEl = element;
            let offsetTop = currentEl.offsetTop;
            
            while (currentEl && currentEl !== view.dom && currentEl.offsetParent) {
                currentEl = currentEl.offsetParent as HTMLElement;
                // Se chegarmos ao editor (ProseMirror class), paramos
                if (currentEl.classList.contains('ProseMirror')) break;
                offsetTop += currentEl.offsetTop;
            }

            // Matemática de Paginação Lógica
            // Altura total de uma "unidade de página" no fluxo contínuo
            const totalPageUnit = pageHeight + pageGap;
            
            // Índice baseado na posição Y absoluta
            return Math.floor(offsetTop / totalPageUnit);

        } catch (e) {
            console.warn("Footnote calculation error", e);
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

    // Ordenação garantida por ID para leitura sequencial
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
    
    // Escuta evento de repaginação da extensão PaginationExtension
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
  
  // ABNT: Separador de 5 cm
  const separatorWidthPx = 5 * CM_TO_PX; 

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
        {Object.entries(footnotesByPage).map(([pageIndexStr, n]) => {
            const pageIndex = parseInt(pageIndexStr);
            const notes = n as FootnoteItem[];
            
            // Posicionamento absoluto no "fundo" da página virtual
            const pageTop = pageIndex * (pageHeight + pageGap);
            const footerAreaTop = pageTop + (pageHeight - marginBottomPx);

            return (
                <div 
                    key={pageIndex}
                    className="absolute flex flex-col justify-start"
                    style={{
                        top: `${footerAreaTop}px`,
                        left: `${marginLeftPx}px`,
                        right: `${marginRightPx}px`,
                        height: `${marginBottomPx}px`,
                        pointerEvents: 'auto', // Permite interação com as notas
                        transform: 'translateY(-100%)', // Puxa para cima da margem inferior (Behavior ABNT)
                        paddingBottom: '10px'
                    }}
                >
                    {/* Separador ABNT (5cm) */}
                    <div 
                        className="border-t border-black mb-2 mt-1" 
                        style={{ width: `${separatorWidthPx}px` }} 
                    />
                    
                    {/* Lista de Notas */}
                    <div className="flex flex-col gap-2 overflow-hidden">
                        {notes.map((note) => (
                            <div 
                                key={note.id} 
                                className="flex gap-2 text-[10px] leading-tight text-black group items-start text-justify"
                                style={{ 
                                    fontFamily: '"Times New Roman", Times, serif',
                                    fontSize: '10pt', // ABNT: Tamanho menor que o texto (geralmente 10pt)
                                    lineHeight: '1.2' // Espaçamento simples
                                }}
                            >
                                <span 
                                    className="font-bold cursor-pointer hover:text-brand vertical-super shrink-0"
                                    onClick={() => {
                                        editor?.chain().setTextSelection(note.pos).scrollIntoView().run();
                                    }}
                                    title="Ir para referência no texto"
                                >
                                    {note.id}
                                </span>
                                <span>
                                    {note.content || <i className="opacity-50 text-gray-500">Clique para editar nota...</i>}
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
