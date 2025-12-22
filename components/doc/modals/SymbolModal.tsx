
import React, { useState } from 'react';
import { X, Sigma, Check, Keyboard } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (symbol: string) => void;
}

const CATEGORIES = {
  'Geral': ['©', '®', '™', '§', '¶', '†', '‡', '•', '–', '—', '…', '€', '£', '¥', '¢'],
  'Matemática': ['+', '-', '×', '÷', '=', '≠', '≈', '±', '∓', '<', '>', '≤', '≥', '∞', '√', '∛', '∫', '∑', '∏', '∂', '∆', '∇', '∀', '∃', '∄', '∈', '∉', '⊂', '⊃', '∪', '∩', '∅', '∧', '∨', '¬', '⇒', '⇔', '∴', '∵'],
  'Grego (Min)': ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'],
  'Grego (Mai)': ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η', 'Θ', 'Ι', 'Κ', 'Λ', 'Μ', 'Ν', 'Ξ', 'Ο', 'Π', 'Ρ', 'Σ', 'Τ', 'Υ', 'Φ', 'Χ', 'Ψ', 'Ω'],
  'Setas': ['←', '↑', '→', '↓', '↔', '↕', '↖', '↗', '↘', '↙', '⇐', '⇑', '⇒', '⇓', '⇔'],
  'Sobrescrito': ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '⁺', '⁻', '⁽', '⁾', 'ⁿ'],
  'Subscrito': ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '₊', '₋', '₍', '₎', 'ₐ', 'ₑ', 'ₒ', 'ₓ']
};

export const SymbolModal: React.FC<Props> = ({ isOpen, onClose, onInsert }) => {
  const [activeTab, setActiveTab] = useState<keyof typeof CATEGORIES>('Geral');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-[#1e1e1e] text-[#e3e3e3] rounded-3xl shadow-2xl p-6 w-full max-w-xl relative animate-in zoom-in-95 border border-[#444746] flex flex-col max-h-[80vh]">
          
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-normal flex items-center gap-2">
                <Keyboard size={20} className="text-brand"/> Símbolos Especiais
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
          </div>

          <div className="flex flex-wrap gap-2 mb-6 border-b border-[#444746] pb-4">
              {Object.keys(CATEGORIES).map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setActiveTab(cat as keyof typeof CATEGORIES)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeTab === cat ? 'bg-[#a8c7fa] text-[#0b141a]' : 'bg-[#2c2c2c] text-gray-300 hover:bg-[#3c3c3c]'}`}
                  >
                      {cat}
                  </button>
              ))}
          </div>

          <div className="overflow-y-auto custom-scrollbar flex-1 grid grid-cols-8 sm:grid-cols-10 gap-2 content-start">
              {CATEGORIES[activeTab].map(char => (
                  <button
                    key={char}
                    onClick={() => { onInsert(char); onClose(); }}
                    className="aspect-square flex items-center justify-center bg-[#2c2c2c] hover:bg-[#a8c7fa] hover:text-[#0b141a] rounded-lg text-lg transition-colors border border-[#444746] hover:border-[#a8c7fa]"
                  >
                      {char}
                  </button>
              ))}
          </div>
       </div>
    </div>
  );
};
