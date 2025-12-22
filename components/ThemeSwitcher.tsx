
import React, { useEffect, useState } from 'react';
import { Check, Palette } from 'lucide-react';

const themes = [
  { id: 'forest', name: 'Forest' },
  { id: 'midnight', name: 'Midnight' },
  { id: 'nordic', name: 'Nordic' },
  { id: 'gruvbox', name: 'Gruvbox' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'synthwave', name: 'Synthwave' },
  { id: 'parchment', name: 'Parchment' },
  { id: 'high-contrast', name: 'Alto Contraste' },
];

interface Props {
  className?: string;
  onThemeSelect?: () => void;
}

export const ThemeSwitcher: React.FC<Props> = ({ className = '', onThemeSelect }) => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('app-theme');
      // Migração de nomes antigos para novos se necessário
      if (saved === 'dragon-year') return 'parchment';
      if (saved === 'slate') return 'nordic';
      if (saved === 'mn') return 'forest';
      if (saved === 'galactic-aurora') return 'synthwave';
      return saved || 'forest';
    }
    return 'forest';
  });

  const applyTheme = (themeId: string) => {
    const root = document.documentElement;
    themes.forEach(t => root.classList.remove(t.id));
    
    // Remove também classes legadas para garantir limpeza
    root.classList.remove('dragon-year', 'slate', 'mn', 'galactic-aurora', 'destino', 'kiyotaka', 'itoshi');
    
    if (themeId !== 'forest') {
      root.classList.add(themeId);
    }
    
    setCurrentTheme(themeId);
    localStorage.setItem('app-theme', themeId);
    
    if (onThemeSelect) onThemeSelect();
  };

  useEffect(() => {
    const root = document.documentElement;
    // Limpeza inicial
    themes.forEach(t => root.classList.remove(t.id));
    root.classList.remove('dragon-year', 'slate', 'mn', 'galactic-aurora', 'destino', 'kiyotaka', 'itoshi');

    if (currentTheme !== 'forest') {
      root.classList.add(currentTheme);
    }
  }, [currentTheme]);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {themes.map(t => (
        <button 
          key={t.id}
          onClick={() => applyTheme(t.id)}
          className={`
            text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors
            ${currentTheme === t.id 
              ? 'bg-brand/10 text-brand font-medium' 
              : 'text-text-sec hover:text-text hover:bg-white/5'}
          `}
        >
          <span>{t.name}</span>
          {currentTheme === t.id && <Check size={14} className="text-brand"/>}
        </button>
      ))}
    </div>
  );
};
