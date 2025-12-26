
import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Node as PMNode } from '@tiptap/pm/model';

export interface PaginationOptions {
  pageHeight: number;
  pageMarginTop: number; 
  pageMarginBottom: number;
  pageGap: number; // Espaço visual cinza entre páginas
}

// Fix: Remove generic <PaginationOptions> as Extension.create in vite-env.d.ts does not accept type arguments
export const PaginationExtension = Extension.create({
  name: 'pagination',

  addOptions() {
    return {
      // Valores padrão (A4 @ 96 DPI)
      pageHeight: 1123, 
      pageMarginTop: 96,
      pageMarginBottom: 96,
      pageGap: 20, 
    };
  },

  addCommands() {
    return {
      setPaginationOptions: (options: Partial<PaginationOptions>) => ({ tr, dispatch }: any) => {
        this.options = { ...this.options, ...options };
        if (dispatch) {
           // Força uma atualização imediata do plugin
           tr.setMeta('pagination-force-update', true);
        }
        return true;
      },
    } as any;
  },

  addProseMirrorPlugins() {
    const key = new PluginKey('pagination');
    
    // CACHE DE ALTO DESEMPENHO
    // Mapeia a referência do objeto Node do ProseMirror para sua altura em pixels.
    // Como os nós do PM são imutáveis, se o conteúdo muda, o objeto muda, e o cache invalida automaticamente.
    const heightCache = new WeakMap<PMNode, number>();

    return [
      new Plugin({
        key,
        state: {
            init() { return DecorationSet.empty; },
            apply(tr, value) {
                // Se o payload da transação contiver decorações calculadas (do loop de view), use-as
                const meta = tr.getMeta(key);
                if (meta && meta.decorations) {
                    return meta.decorations;
                }
                // Caso contrário, mapeie as decorações antigas para manter a estabilidade visual
                // durante a digitação até o próximo frame de cálculo
                return value.map(tr.mapping, tr.doc);
            }
        },
        props: {
          decorations(state) {
            return this.getState(state);
          }
        },
        view: (editorView) => {
          
          // Função que cria o elemento DOM do espaçador (Gap)
          const createPageBreakWidget = (height: number, pageNumber: number) => {
             const container = document.createElement('div');
             container.className = 'pagination-gap-widget';
             container.dataset.page = String(pageNumber);
             
             // O widget deve ocupar exatamente o espaço necessário para pular
             // do final do conteúdo da página anterior até o início do conteúdo da próxima.
             container.style.height = `${height}px`;
             container.style.width = '100%';
             container.style.display = 'block';
             container.style.pointerEvents = 'none';
             container.style.userSelect = 'none';
             
             return container;
          };

          // Função para criar o "Ghost Page Filler" ao final do documento
          const createGhostPageWidget = (height: number) => {
             const container = document.createElement('div');
             container.className = 'pagination-ghost-filler';
             container.style.height = `${height}px`;
             container.style.width = '100%';
             container.style.display = 'block';
             // Importante: pointer-events none permite clicar "através" dele para focar no editor,
             // mas o elemento físico garante que o container do editor tenha altura total.
             container.style.pointerEvents = 'none'; 
             
             return container;
          };

          const getNodeHeight = (node: PMNode, offset: number) => {
               // Tenta pegar altura do cache
               let nodeHeight = heightCache.get(node);

               // Cache Miss: Medir no DOM
               if (nodeHeight === undefined) {
                   const domNode = editorView.nodeDOM(offset) as HTMLElement;
                   if (domNode && domNode.offsetHeight) {
                       // Inclui margens no cálculo da altura do bloco
                       const style = window.getComputedStyle(domNode);
                       const marginTop = parseFloat(style.marginTop) || 0;
                       const marginBottom = parseFloat(style.marginBottom) || 0;
                       nodeHeight = domNode.offsetHeight + marginTop + marginBottom;
                       
                       heightCache.set(node, nodeHeight);
                   } else {
                       // Fallback conservador
                       nodeHeight = 24; 
                   }
               }
               return nodeHeight;
          };

          let isCalculating = false;
          let frameId: number;

          const calculatePagination = () => {
            if (!editorView || editorView.isDestroyed) return;
            isCalculating = true;

            const { state } = editorView;
            const { pageHeight, pageMarginTop, pageMarginBottom, pageGap } = this.options;
            
            // Altura útil de conteúdo (ex: A4 1123px - 96px - 96px = 931px)
            const contentHeightPerBox = pageHeight - pageMarginTop - pageMarginBottom;
            
            // Altura do salto visual (Margem Fundo + Gap + Margem Topo)
            const breakHeight = pageMarginBottom + pageGap + pageMarginTop;

            const decorations: Decoration[] = [];
            
            // Cursor Y virtual: rastreia a posição atual dentro da página lógica
            let currentY = 0;
            let pageCount = 1;

            const nodesArray: { node: PMNode, offset: number, height: number }[] = [];

            // 1. Pré-processamento: Coletar nós e alturas
            state.doc.forEach((node, offset) => {
                if (!node.isBlock) return;
                const height = getNodeHeight(node, offset);
                nodesArray.push({ node, offset, height });
            });

            // 2. Lógica de Paginação com Look-Ahead
            for (let i = 0; i < nodesArray.length; i++) {
                const { node, offset, height } = nodesArray[i];
                
                const isExplicitBreak = node.type.name === 'pageBreak' || node.attrs.pageBreakBefore;
                const keepLines = node.attrs.keepLinesTogether;
                const keepNext = node.attrs.keepWithNext;

                let forceBreakHere = false;

                // Regra 1: Quebra Explícita
                if (isExplicitBreak) {
                    if (currentY > 20) { // Ignora se já estiver no topo (deadzone)
                        forceBreakHere = true;
                    }
                }
                // Regra 2: Keep Lines Together (Evita quebrar o bloco no meio se ele couber inteiro na PRÓXIMA página)
                // Se o bloco é maior que o espaço restante, mas menor que uma página inteira, joga pra próxima.
                else if (keepLines && currentY + height > contentHeightPerBox && height < contentHeightPerBox) {
                    forceBreakHere = true;
                }
                // Regra 3: Keep With Next (Se este + próximo não cabem, quebra ANTES deste)
                else if (keepNext && i < nodesArray.length - 1) {
                    const nextNode = nodesArray[i+1];
                    // Se o nó atual + o próximo excederem a página, quebra aqui para mantê-los juntos na próxima
                    // (Simplificação: assume que queremos pelo menos o início do próximo nó junto)
                    if (currentY + height + (nextNode.height / 2) > contentHeightPerBox) {
                        // Só aplica se não estivermos já no topo da página (evitar loop infinito)
                        if (currentY > 0) {
                            forceBreakHere = true;
                        }
                    }
                }
                // Regra 4: Overflow Natural
                else if (currentY + height > contentHeightPerBox) {
                    forceBreakHere = true;
                }

                if (forceBreakHere) {
                    // Calcular quanto espaço sobrou nesta página para preencher com o gap
                    const remainingSpaceOnPage = contentHeightPerBox - currentY;
                    const widgetHeight = Math.max(0, remainingSpaceOnPage) + breakHeight;

                    if (node.type.name === 'pageBreak') {
                        // O nó pageBreak em si é o divisor, inserimos DEPOIS dele
                        decorations.push(
                            Decoration.widget(offset + node.nodeSize, createPageBreakWidget(widgetHeight, pageCount + 1), { side: -1 })
                        );
                        currentY = 0;
                    } else {
                        // Quebra ANTES do nó de conteúdo
                        decorations.push(
                            Decoration.widget(offset, createPageBreakWidget(widgetHeight, pageCount + 1), { side: -1 })
                        );
                        currentY = height; // O nó vai para a próxima página, então ocupa espaço lá
                    }
                    pageCount++;
                } else {
                    // Cabe na página atual
                    if (node.type.name !== 'pageBreak') {
                        currentY += height;
                    }
                }
            }

            // --- LÓGICA DE PÁGINA FANTASMA (Final Filler) ---
            const remainingSpaceLastPage = contentHeightPerBox - currentY;
            const fillerHeight = Math.max(0, remainingSpaceLastPage) + pageMarginBottom;
            
            if (fillerHeight > 0) {
                decorations.push(
                    Decoration.widget(state.doc.content.size, createGhostPageWidget(fillerHeight), { side: 1 })
                );
            }

            // Despacha as decorações calculadas para o estado
            if (!editorView.isDestroyed) {
                const decoSet = DecorationSet.create(state.doc, decorations);
                
                const tr = editorView.state.tr.setMeta(key, { decorations: decoSet });
                editorView.dispatch(tr);

                const event = new CustomEvent('pagination-calculated', { detail: { count: pageCount } });
                editorView.dom.dispatchEvent(event);
            }

            isCalculating = false;
          };

          const scheduleUpdate = () => {
              if (isCalculating) return;
              cancelAnimationFrame(frameId);
              frameId = requestAnimationFrame(calculatePagination);
          };

          // Executar cálculo inicial
          scheduleUpdate();

          return {
            update(view, prevState) {
                const docChanged = !view.state.doc.eq(prevState.doc);
                const forceUpdate = view.state.tr.getMeta('pagination-force-update');
                
                if (docChanged || forceUpdate) {
                    scheduleUpdate();
                }
            },
            destroy() {
                cancelAnimationFrame(frameId);
            }
          };
        }
      }),
    ];
  },
});
