
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

            // PERFORMANCE: Iteração otimizada
            // Varre apenas os nós de bloco de nível superior (parágrafos, títulos, tabelas, imagens)
            // O(N) onde N é o número de blocos (muito menor que caracteres).
            state.doc.forEach((node, offset) => {
               if (!node.isBlock) return;

               // Tenta pegar altura do cache
               let nodeHeight = heightCache.get(node);

               // Cache Miss: Medir no DOM
               if (nodeHeight === undefined) {
                   // nodeDOM retorna o nó DOM correspondente.
                   // Para nós de texto/bloco padrão, funciona bem.
                   const domNode = editorView.nodeDOM(offset) as HTMLElement;
                   if (domNode && domNode.offsetHeight) {
                       nodeHeight = domNode.offsetHeight;
                       heightCache.set(node, nodeHeight);
                   } else {
                       // Fallback conservador para nós ainda não montados/visíveis
                       // (ex: fora da viewport se usando content-visibility)
                       nodeHeight = 24; 
                   }
               }

               // Lógica de Quebra de Página
               // Se adicionar este nó excede a altura útil da página atual...
               if (currentY + nodeHeight > contentHeightPerBox) {
                   // Calcular quanto espaço sobrou em branco na página atual
                   const remainingSpaceOnPage = contentHeightPerBox - currentY;
                   
                   // A altura do widget deve preencher esse espaço restante + o salto padrão
                   const widgetHeight = remainingSpaceOnPage + breakHeight;

                   // Inserir Widget ANTES do nó atual
                   decorations.push(
                       Decoration.widget(offset, createPageBreakWidget(widgetHeight, pageCount + 1), { side: -1 })
                   );

                   // O nó atual agora começa no topo da próxima página
                   currentY = nodeHeight;
                   pageCount++;
               } else {
                   // O nó cabe na página atual
                   currentY += nodeHeight;
               }
            });

            // --- LÓGICA DE PÁGINA FANTASMA (Final Filler) ---
            // Adiciona um widget ao final do documento para preencher o espaço restante da última página.
            // Isso força o DOM do editor a ter a mesma altura que o papel de fundo (Background DIV).
            const remainingSpaceLastPage = contentHeightPerBox - currentY;
            // O filler deve cobrir o espaço restante do conteúdo + a margem inferior
            const fillerHeight = Math.max(0, remainingSpaceLastPage) + pageMarginBottom;
            
            if (fillerHeight > 0) {
                decorations.push(
                    Decoration.widget(state.doc.content.size, createGhostPageWidget(fillerHeight), { side: 1 })
                );
            }

            // Despacha as decorações calculadas para o estado
            if (!editorView.isDestroyed) {
                const decoSet = DecorationSet.create(state.doc, decorations);
                
                // Evita disparar transação se nada mudou visualmente (opcional, mas bom pra performance)
                // Aqui sempre disparamos para garantir sync com o React no DocEditor
                const tr = editorView.state.tr.setMeta(key, { decorations: decoSet });
                editorView.dispatch(tr);

                // Notifica o React para renderizar os papéis de fundo corretos
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
                // Só recalcula se o documento mudou ou se forçamos via comando
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
