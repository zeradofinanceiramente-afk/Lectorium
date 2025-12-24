
import React from 'react';
import { AlertTriangle, FileDiff, Database, RefreshCw, XCircle, FileWarning } from 'lucide-react';
import { BaseModal } from '../../shared/BaseModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onResolve: (action: 'use_external' | 'restore_lectorium' | 'merge') => void;
  hasPageMismatch?: boolean;
}

export const ConflictResolutionModal: React.FC<Props> = ({ isOpen, onClose, onResolve, hasPageMismatch }) => {
  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Conflito de Versões"
      icon={<AlertTriangle size={24} className="text-yellow-500" />}
      maxWidth="max-w-lg"
    >
      <div className="space-y-6">
        <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-xl">
          <p className="text-sm text-yellow-200 leading-relaxed">
            Detectamos que este arquivo foi modificado externamente (Acrobat/Preview). 
            O conteúdo visual não corresponde aos metadados do Lectorium.
          </p>
        </div>

        {hasPageMismatch && (
            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg flex gap-3 items-start">
                <FileWarning size={18} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-200">
                    <strong>Alerta Crítico:</strong> O número de páginas foi alterado. A opção de "Mesclar" foi desativada para evitar corrupção de anotações (destaques fora de lugar).
                </p>
            </div>
        )}

        <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Escolha como proceder:</h4>

        <div className="space-y-3">
          <button 
            onClick={() => onResolve('use_external')}
            className="w-full flex items-start gap-4 p-4 rounded-xl bg-[#2c2c2c] border border-[#444] hover:border-brand/50 hover:bg-[#333] transition-all group text-left"
          >
            <div className="bg-blue-500/10 p-2.5 rounded-lg text-blue-400 group-hover:text-blue-300">
              <FileDiff size={20} />
            </div>
            <div>
              <h5 className="font-bold text-white mb-1">Manter Edição Externa</h5>
              <p className="text-xs text-text-sec leading-relaxed">
                Usa o PDF atual como base. Anotações antigas do Lectorium que não estão visíveis no arquivo serão descartadas para evitar fantasmas.
              </p>
            </div>
          </button>

          <button 
            onClick={() => onResolve('merge')}
            disabled={hasPageMismatch}
            className={`w-full flex items-start gap-4 p-4 rounded-xl border transition-all group text-left ${hasPageMismatch ? 'bg-[#252525] border-[#333] opacity-50 cursor-not-allowed' : 'bg-[#2c2c2c] border-[#444] hover:border-brand/50 hover:bg-[#333]'}`}
          >
            <div className={`p-2.5 rounded-lg ${hasPageMismatch ? 'bg-gray-700 text-gray-500' : 'bg-purple-500/10 text-purple-400 group-hover:text-purple-300'}`}>
              <RefreshCw size={20} />
            </div>
            <div>
              <h5 className={`font-bold mb-1 ${hasPageMismatch ? 'text-gray-500' : 'text-white'}`}>Tentar Mesclar (Merge)</h5>
              <p className="text-xs text-text-sec leading-relaxed">
                Tenta reaplicar as anotações do Lectorium sobre o novo arquivo. {hasPageMismatch ? '(Indisponível: Geometria alterada)' : 'Risco: Pode haver desalinhamento.'}
              </p>
            </div>
          </button>

          <button 
            onClick={() => onResolve('restore_lectorium')}
            className="w-full flex items-start gap-4 p-4 rounded-xl bg-[#2c2c2c] border border-[#444] hover:border-brand/50 hover:bg-[#333] transition-all group text-left"
          >
            <div className="bg-green-500/10 p-2.5 rounded-lg text-green-400 group-hover:text-green-300">
              <Database size={20} />
            </div>
            <div>
              <h5 className="font-bold text-white mb-1">Restaurar Dados Lectorium</h5>
              <p className="text-xs text-text-sec leading-relaxed">
                Ignora alterações visuais externas e restaura o estado exato salvo anteriormente no banco de dados local.
              </p>
            </div>
          </button>
        </div>
      </div>
    </BaseModal>
  );
};
