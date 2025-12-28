
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
      
      // No Chromium, para Google Fonts, ainda precisamos do CSS URL pois ele retorna múltiplos @font-face (woff2).
      // A API nativa FontFace("Name", "url(...)") funciona melhor para arquivos diretos.
      // Entretanto, podemos usar fetch para pegar o CSS e extrair as URLs ou usar a estratégia híbrida:
      // Carregar o CSS mas esperar o carregamento via document.fonts.load() antes de aplicar.
      
      // Estratégia Híbrida Segura: Link com preconnect, mas monitorado pela API
      const link = document.createElement('link');
      link.href = googleFontUrl;
      link.rel = 'stylesheet';
      document.head.appendChild(link);

      // 2. Aguardar disponibilidade (Blink Optimization)
      // Isso diz ao navegador para priorizar o download e renderização
      await document.fonts.load(`12px "${familyName}"`);
      
      console.log(`[Auto-Font] Fonte ativa e rasterizada: ${familyName}`);
      
  } catch (e) {
      console.warn(`[Auto-Font] Falha ao carregar: ${familyName}`, e);
  }
};

// --- Custom Text Renderer with De-Fragmentation & Geometry Normalization ---
export const renderCustomTextLayer = (textContent: any, container: HTMLElement, viewport: any, detectColumns: boolean) => {
  container.innerHTML = '';
  
  // 1. Extract Geometry & Data
  const rawItems = textContent.items.map((item: any) => {
    const tx = item.transform;
    const fontHeight = Math.sqrt(tx[3] * tx[3] + tx[2] * tx[2]);
    const fontWidth = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
    const [x, y] = viewport.convertToViewportPoint(tx[4], tx[5]);
    const fontSize = fontHeight * viewport.scale;
    
    // Estimate width in viewport pixels
    // item.width is usually in PDF units.
    const itemWidth = item.width ? item.width * viewport.scale : (item.str.length * fontSize * 0.5);

    return {
      item,
      str: item.str,
      x,
      y, // This is the baseline Y
      width: itemWidth,
      fontSize,
      fontName: item.fontName,
      tx: tx,
      // Calculate font scale for CSS transform (Aspect Ratio of the font glyphs defined in PDF)
      scaleX: fontHeight > 0 ? (fontWidth / fontHeight) : 1,
      angle: Math.atan2(tx[1], tx[0])
    };
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

  // 3. Merge / De-fragmentation Pass (Granularidade: Palavras)
  // Otimização para Brush Tool: Agrupa apenas fragmentos de palavras, mas separa palavras por espaço.
  const mergedItems: any[] = [];
  if (rawItems.length > 0) {
    let current = rawItems[0];
    
    for (let i = 1; i < rawItems.length; i++) {
      const next = rawItems[i];
      
      const sameLine = Math.abs(current.y - next.y) < (current.fontSize * 0.5);
      const sameFont = current.fontName === next.fontName && Math.abs(current.fontSize - next.fontSize) < 2;
      
      const expectedNextX = current.x + current.width;
      const gap = next.x - expectedNextX;
      
      // Limiar para considerar como espaço em branco (separação de palavras)
      const spaceWidth = current.fontSize * 0.20;
      
      const isWordBreak = gap > spaceWidth;
      const isWhitespace = current.str.trim().length === 0 || next.str.trim().length === 0;

      // Merge APENAS se não houver um gap significativo (quebra de palavra) 
      // ou se estivermos lidando com caracteres de espaço soltos (que devem colar na palavra)
      const shouldMerge = sameLine && sameFont && (!isWordBreak || isWhitespace);

      if (shouldMerge) {
        // Se estamos forçando merge mas existe um pequeno gap visual que o PDF não marcou com espaço,
        // e nenhum dos lados tem espaço, adicionamos um para garantir a semântica na cópia.
        if (gap > spaceWidth && !current.str.endsWith(' ') && !next.str.startsWith(' ')) {
             current.str += ' ';
        }

        current.str += next.str;
        // Expande a largura para incluir o próximo item
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

    span.style.left = `${part.x}px`;
    span.style.top = `${calculatedTop - paddingPx}px`;
    span.style.fontSize = `${part.fontSize}px`;
    span.style.fontFamily = fontFamily;
    
    span.style.paddingTop = `${paddingPx}px`;
    span.style.paddingBottom = `${paddingPx}px`;
    span.style.boxSizing = 'content-box'; 

    span.style.position = 'absolute';
    span.style.transformOrigin = '0% 0%';
    span.style.whiteSpace = 'pre';
    span.style.cursor = 'text';
    span.style.color = 'transparent'; // Invisible text for selection
    span.style.lineHeight = '1.0'; 
    // OTIMIZAÇÃO TEXTO: Força precisão geométrica
    // Reduz o "drift" (desalinhamento) entre o texto real da imagem e a camada de seleção transparente
    span.style.textRendering = 'geometricPrecision'; 
    
    // CRITICAL: Ensure spans are interactive even if container is pointer-events: none
    span.style.pointerEvents = 'all';
    
    // Use opacity 0 instead of visibility hidden for layout stability during measurement
    span.style.opacity = '0';

    span.dataset.pdfX = (part.x ?? 0).toString();
    span.dataset.pdfTop = (calculatedTop ?? 0).toString();
    span.dataset.pdfWidth = (part.width ?? 0).toString();
    span.dataset.pdfHeight = (part.fontSize ?? 0).toString();

    container.appendChild(span);
    itemsToMeasure.push({ span, part });

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
             // Se houver gap visual significativo, insira espaço textual para copy/paste correto
             if (gap > part.fontSize * 0.15) {
                 container.appendChild(document.createTextNode(' '));
             }
        }
    }
  });

  // 5. Normalize Width (Second Pass: Batch Measure & Correct)
  // We use requestAnimationFrame to allow browser layout calc, but set timeout to force visibility
  // in case something fails or dimensions are zero.
  
  const applyTransform = () => {
      // Get all widths in one go to minimize reflows
      const naturalWidths = itemsToMeasure.map(item => item.span.getBoundingClientRect().width);

      itemsToMeasure.forEach((item, index) => {
          const { span, part } = item;
          const naturalWidth = naturalWidths[index];
          const targetWidth = part.width; 

          let finalScale = part.scaleX;

          // Scale correction if rendered font width differs from PDF expected width
          if (naturalWidth > 0 && targetWidth > 0) {
              const correctionFactor = targetWidth / naturalWidth;
              finalScale = part.scaleX * correctionFactor;
          }

          let transformCSS = `scaleX(${finalScale})`;
          if (part.angle !== 0) {
             transformCSS = `rotate(${part.angle}rad) ` + transformCSS;
          }

          span.style.transform = transformCSS;
          span.style.opacity = '1'; // Make fully interactive (still transparent color)
      });
  };

  // Run immediately if possible, or defer slightly. 
  // Since opacity is 0, visual jump is minimized.
  setTimeout(applyTransform, 0);
};
