
import React, { useEffect, useState } from 'react';
import { Check, Palette, Sliders } from 'lucide-react';

const themes = [
  { id: 'forest', name: 'Verde (Padrão)' },
  { id: 'azul', name: 'Azul' },
  { id: 'roxo', name: 'Roxo' },
  { id: 'magenta', name: 'Magenta' },
  { id: 'rosa', name: 'Rosa' },
  { id: 'vermelho', name: 'Vermelho' },
  { id: 'laranja', name: 'Laranja' },
  { id: 'amarelo', name: 'Amarelo' },
  { id: 'lima', name: 'Lima' },
  { id: 'prata', name: 'Prata' },
  { id: 'custom', name: 'Personalizado' },
];

interface Props {
  className?: string;
  onThemeSelect?: () => void;
}

export const ThemeSwitcher: React.FC<Props> = ({ className = '', onThemeSelect }) => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('app-theme');
      // Migração e limpeza de temas deletados ou legados
      const deleted = ['nordic', 'gruvbox', 'dracula', 'high-contrast', 'muryokusho', 'synthwave', 'parchment', 'ciano', 'vinho', 'dourado'];
      if (deleted.includes(saved || '')) return 'forest';
      return saved || 'forest';
    }
    return 'forest';
  });

  const [customColor, setCustomColor] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('custom-theme-brand') || '#ffffff';
    }
    return '#ffffff';
  });

  const applyTheme = (themeId: string, color?: string) => {
    const root = document.documentElement;
    
    // Limpeza de classes de todos os temas possíveis
    themes.forEach(t => root.classList.remove(t.id));
    // Remove também classes legadas para garantir limpeza
    root.classList.remove('nordic', 'gruvbox', 'dracula', 'high-contrast', 'ciano', 'vinho', 'dourado');
    
    if (themeId === 'custom') {
      root.classList.add('custom');
      const brandColor = color || customColor;
      root.style.setProperty('--custom-brand', brandColor);
      if (color) {
        setCustomColor(color);
        localStorage.setItem('custom-theme-brand', color);
      }
    } else {
      root.style.removeProperty('--custom-brand');
      if (themeId !== 'forest') {
        root.classList.add(themeId);
      }
    }
    
    setCurrentTheme(themeId);
    localStorage.setItem('app-theme', themeId);
    
    if (onThemeSelect) onThemeSelect();
  };

  useEffect(() => {
    // Aplicação inicial garantida
    const root = document.documentElement;
    themes.forEach(t => root.classList.remove(t.id));
    root.classList.remove('nordic', 'gruvbox', 'dracula', 'high-contrast', 'ciano', 'vinho', 'dourado');

    if (currentTheme === 'custom') {
      root.classList.add('custom');
      root.style.setProperty('--custom-brand', customColor);
    } else if (currentTheme !== 'forest') {
      root.classList.add(currentTheme);
    }
  }, [currentTheme, customColor]);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {themes.map(t => (
        <div key={t.id} className="flex flex-col">
          <button 
            onClick={() => applyTheme(t.id)}
            className={`
              text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors
              ${currentTheme === t.id 
                ? 'bg-brand/10 text-brand font-medium' 
                : 'text-text-sec hover:text-text hover:bg-white/5'}
            `}
          >
            <span className="flex items-center gap-2">
              {t.id === 'custom' && <Palette size={14} className={currentTheme === 'custom' ? 'text-brand' : 'text-text-sec'}/>}
              {t.name}
            </span>
            {currentTheme === t.id && <Check size={14} className="text-brand"/>}
          </button>
          
          {t.id === 'custom' && currentTheme === 'custom' && (
            <div className="mx-3 mt-1 mb-2 p-2 bg-black/40 border border-white/10 rounded-lg animate-in slide-in-from-top-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-text-sec uppercase font-bold">Cor do Destaque</span>
                <div className="relative w-8 h-8 flex items-center justify-center">
                  <input 
                    type="color" 
                    value={customColor}
                    onChange={(e) => applyTheme('custom', e.target.value)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                  />
                  <div 
                    className="w-6 h-6 rounded-full border border-white/20 shadow-sm"
                    style={{ backgroundColor: customColor }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
