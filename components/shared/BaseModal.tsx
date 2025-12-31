
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  footer?: React.ReactNode;
}

export const BaseModal: React.FC<BaseModalProps> = ({ 
  isOpen, onClose, title, icon, children, maxWidth = 'max-w-md', footer 
}) => {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-200 print:hidden">
      <div 
        className={`bg-surface border border-border rounded-[2rem] w-full ${maxWidth} relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {icon && <div className="text-brand">{icon}</div>}
            {title && <h3 className="text-xl font-bold text-text">{title}</h3>}
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-text-sec hover:text-text hover:bg-white/5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-6 border-t border-border flex justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
