
// --- Dynamic Font Loader (Chromium Optimized) ---
const attemptedFonts = new Set<string>();

/**
 * Tenta baixar automaticamente uma fonte do Google Fonts se ela não estiver no sistema.
 * Remove prefixos de subset (Ex: "ABCDE+Roboto-Bold" -> "Roboto")
 * 
 * Otimizado para Chromium usando a Font Loading API (document.fonts).
 * Evita injeção de <link> que causa FOUT (Flash of Unstyled Text) e Layout Thrashing.
 */
export const tryAutoDownloadFont = async (rawFontName: string) => {
  if (!navigator.onLine) return; // Não faz nada se offline
  
  // Limpeza do nome da fonte
  let cleanName = rawFontName.replace(/['"]/g, '').trim();
  
  if (cleanName.includes('+')) {
    cleanName = cleanName.split('+')[1];
  }

  const familyName = cleanName.split('-')[0];

  const skipList = ['Arial', 'Helvetica', 'Times', 'Courier', 'Verdana', 'Georgia', 'sans-serif', 'serif', 'monospace'];
  if (attemptedFonts.has(familyName) || skipList.some(s => familyName.toLowerCase().includes(s.toLowerCase()))) {
    return;
  }

  attemptedFonts.add(familyName);
  console.log(`[Auto-Font] Detectada fonte ausente: ${familyName}`);

  try {
      // 1. Criar FontFace
      const googleFontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familyName)}:wght@300;400;500;700&display=swap`;
      
      // Estratégia Híbrida Segura: Link com preconnect, mas monitorado pela API
      const link = document.createElement('link');
      link.href = googleFontUrl;
      link.rel = 'stylesheet';
      document.head.appendChild(link);

      // 2. Aguardar disponibilidade (Blink Optimization)
      await document.fonts.load(`12px "${familyName}"`);
      
      console.log(`[Auto-Font] Fonte ativa e rasterizada: ${familyName}`);
      
  } catch (e) {
      console.warn(`[Auto-Font] Falha ao carregar: ${familyName}`, e);
  }
};

// --- Custom Text Renderer with De-Fragmentation & Geometry Normalization ---
export const renderCustomTextLayer = (textContent: any, container: HTMLElement, viewport: any, detectColumns: boolean) => {
  container.innerHTML = '';
  
  // 1. Extract Geometry & Data & EXPLODE WORDS
  // A "explosão" é crucial: se o PDF agrupa a linha inteira em um item ("Hello World"),
  // precisamos dividir em ["Hello", " ", "World"] para que o DOM tenha spans separados.
  // Isso permite que o evento de clique (Smart Tap) detecte a palavra exata sob o cursor.
  const rawItems: any[] = [];
  
  textContent.items.forEach((item: any) => {
    const tx = item.transform;
    const fontHeight = Math.sqrt(tx[3] * tx[3] + tx[2] * tx[2]);
    const fontWidth = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
    const [x, y] = viewport.convertToViewportPoint(tx[4], tx[5]);
    const fontSize = fontHeight * viewport.scale;
    
    // Width do bloco inteiro no viewport
    const totalWidth = item.width ? item.width * viewport.scale : (item.str.length * fontSize * 0.5);
    const text = item.str;

    // Se o texto contém espaços e não é apenas espaço em branco
    if (text.length > 1 && /\s/.test(text)) {
        // Divide mantendo os separadores (espaços)
        const parts = text.split(/(\s+)/);
        
        // Estimativa uniforme de largura por caractere (heurística, já que não temos métricas de fonte precisas aqui)
        const charWidth = totalWidth / text.length;
        
        let currentXOffset = 0;

        parts.forEach((part: string) => {
            if (part.length === 0) return;

            const partWidth = part.length * charWidth;
            
            rawItems.push({
                item, // Referência ao item original para estilos
                str: part,
                x: x + currentXOffset,
                y,
                width: partWidth,
                fontSize,
                fontName: item.fontName,
                tx,
                scaleX: fontHeight > 0 ? (fontWidth / fontHeight) : 1,
                angle: Math.atan2(tx[1], tx[0])
            });

            currentXOffset += partWidth;
        });
    } else {
        // Palavra única ou fragmento sem espaços
        rawItems.push({
            item,
            str: text,
            x,
            y,
            width: totalWidth,
            fontSize,
            fontName: item.fontName,
            tx,
            scaleX: fontHeight > 0 ? (fontWidth / fontHeight) : 1,
            angle: Math.atan2(tx[1], tx[0])
        });
    }
  });

  // 2. Sort Items (Y Descending - Top to Bottom, then X Ascending - Left to Right)
  rawItems.sort((a: any, b: any) => {
    // FIX: Double Page / Column Sorting Logic
    if (detectColumns) {
      const mid = viewport.width / 2;
      const centerA = a.x + (a.width / 2);
      const centerB = b.x + (b.width / 2);
      const isLeftA = centerA < mid;
      const isLeftB = centerB < mid;

      if (isLeftA !== isLeftB) {
        return isLeftA ? -1 : 1;
      }
    }

    const yDiff = a.y - b.y;
    
    // Tolerance for grouping lines (roughly 20% of font size)
    if (Math.abs(yDiff) < (Math.min(a.fontSize, b.fontSize) * 0.4)) { 
       return a.x - b.x; 
    }
    // Otherwise, top lines come first (smaller Y values first)
    return yDiff; 
  });

  // 3. Merge / De-fragmentation Pass (Granularidade: Palavras Estritas)
  // Otimização para Smart Select: Agrupa fragmentos da mesma palavra (ex: "He" + "llo"),
  // mas NUNCA funde se houver espaço ou gap.
  const mergedItems: any[] = [];
  if (rawItems.length > 0) {
    let current = rawItems[0];
    
    for (let i = 1; i < rawItems.length; i++) {
      const next = rawItems[i];
      
      const sameLine = Math.abs(current.y - next.y) < (current.fontSize * 0.5);
      const sameFont = current.fontName === next.fontName && Math.abs(current.fontSize - next.fontSize) < 2;
      
      const expectedNextX = current.x + current.width;
      const gap = next.x - expectedNextX;
      
      // Limiar para considerar como espaço em branco visual
      const spaceWidth = current.fontSize * 0.25;
      const isVisualGap = gap > spaceWidth;

      // Verifica se é um caractere de espaço/quebra
      const isSpace = /^\s+$/.test(current.str) || /^\s+$/.test(next.str);

      // Merge APENAS se: Mesma linha, mesma fonte, sem gap visual grande E nenhum dos dois é um espaço isolado
      // Se um deles é espaço, queremos mantê-lo separado (ou ele separa as palavras adjacentes)
      const shouldMerge = sameLine && sameFont && !isVisualGap && !isSpace;

      if (shouldMerge) {
        current.str += next.str;
        // Expande a largura para incluir o próximo item (incluindo pequenos gaps de kerning)
        current.width = (next.x + next.width) - current.x;
      } else {
        mergedItems.push(current);
        current = next;
      }
    }
    mergedItems.push(current);
  }

  // Array to hold items for batch DOM measurement
  const itemsToMeasure: { span: HTMLSpanElement, part: any }[] = [];

  // 4. Render Merged Items (First Pass: DOM Injection)
  mergedItems.forEach((part: any, index: number) => {
    if (!part.str || part.str.length === 0) return;

    const span = document.createElement('span');
    span.textContent = part.str;

    let fontAscent = 0.85; 
    let fontFamily = "'Google Sans', 'Inter', sans-serif";
    
    if (textContent.styles && part.fontName && textContent.styles[part.fontName]) {
        const style = textContent.styles[part.fontName];
        if (style.ascent) fontAscent = style.ascent;
        
        if (style.fontFamily) {
             fontFamily = style.fontFamily;
             if (style.fontFamily.toLowerCase().includes('times') || style.fontFamily.toLowerCase().includes('serif')) {
                 fontAscent = 0.89;
             }
             // Usa a API de checagem nativa
             if (!document.fonts.check(`12px "${style.fontFamily}"`)) {
                 tryAutoDownloadFont(style.fontFamily);
             }
        }
    }

    const calculatedTop = part.y - (part.fontSize * fontAscent);
    const verticalPaddingFactor = 0.20; 
    const paddingPx = part.fontSize * verticalPaddingFactor;
    
    // MARGIN OF ERROR FIX:
    // Adiciona padding horizontal generoso para aumentar a área de clique (Hitbox)
    // Isso ajuda em telas de toque e para palavras pequenas.
    const hPadding = part.fontSize * 0.3;

    span.style.left = `${part.x - hPadding}px`;
    span.style.top = `${calculatedTop - paddingPx}px`;
    span.style.fontSize = `${part.fontSize}px`;
    span.style.fontFamily = fontFamily;
    
    span.style.paddingTop = `${paddingPx}px`;
    span.style.paddingBottom = `${paddingPx}px`;
    span.style.paddingLeft = `${hPadding}px`;
    span.style.paddingRight = `${hPadding}px`;
    
    span.style.boxSizing = 'content-box'; 

    span.style.position = 'absolute';
    span.style.transformOrigin = '0% 0%';
    span.style.whiteSpace = 'pre';
    span.style.cursor = 'text';
    span.style.color = 'transparent'; // Invisible text for selection
    span.style.lineHeight = '1.0'; 
    span.style.textRendering = 'geometricPrecision'; 
    
    // CRITICAL: Ensure spans are interactive even if container is pointer-events: none
    span.style.pointerEvents = 'all';
    
    // Use opacity 0 initially for measurement stability
    span.style.opacity = '0';

    // DATASET mantido puro (geometria real do texto) para seleção correta
    span.dataset.pdfX = (part.x ?? 0).toString();
    span.dataset.pdfTop = (calculatedTop ?? 0).toString();
    span.dataset.pdfWidth = (part.width ?? 0).toString();
    span.dataset.pdfHeight = (part.fontSize ?? 0).toString();

    container.appendChild(span);
    itemsToMeasure.push({ span, part });

    // Inserção de quebras de linha/espaço visual para melhor copy/paste
    if (index < mergedItems.length - 1) {
        const nextPart = mergedItems[index + 1];
        const verticalDiff = nextPart.y - part.y;
        
        if (verticalDiff > part.fontSize * 0.5) {
             container.appendChild(document.createElement('br'));
        } 
        else if (detectColumns && (nextPart.y < part.y - 100)) {
             container.appendChild(document.createElement('br'));
             container.appendChild(document.createElement('br'));
        }
        else if (nextPart.x > (part.x + part.width)) {
             const gap = nextPart.x - (part.x + part.width);
             // Se houver gap visual e não for espaço, insere espaço de texto
             if (gap > part.fontSize * 0.15 && !/^\s+$/.test(part.str)) {
                 container.appendChild(document.createTextNode(' '));
             }
        }
    }
  });

  // 5. Normalize Width (Second Pass: Batch Measure & Correct)
  const applyTransform = () => {
      // Get all widths in one go to minimize reflows
      const naturalWidths = itemsToMeasure.map(item => item.span.getBoundingClientRect().width);

      itemsToMeasure.forEach((item, index) => {
          const { span, part } = item;
          // Subtrai o padding artificial para o cálculo de escala
          const hPadding = parseFloat(span.style.paddingLeft) || 0;
          const totalHPadding = hPadding * 2;
          
          const naturalWidth = Math.max(0, naturalWidths[index] - totalHPadding);
          const targetWidth = part.width; 

          let finalScale = part.scaleX;

          // Scale correction if rendered font width differs from PDF expected width
          if (naturalWidth > 0 && targetWidth > 0) {
              const correctionFactor = targetWidth / naturalWidth;
              // Limit correction to sane bounds (avoid huge stretching on weird chars)
              const clampedCorrection = Math.max(0.5, Math.min(2.0, correctionFactor));
              finalScale = part.scaleX * clampedCorrection;
          }

          let transformCSS = `scaleX(${finalScale})`;
          if (part.angle !== 0) {
             transformCSS = `rotate(${part.angle}rad) ` + transformCSS;
          }

          span.style.transform = transformCSS;
          span.style.opacity = '1'; // Make fully interactive
      });
  };

  // Run immediately if possible, or defer slightly. 
  setTimeout(applyTransform, 0);
};
