import React, { useState } from 'react';
import { Save, Copy, X, Loader2, CheckCircle, FileText, AlertCircle, AlertTriangle, Hourglass } from 'lucide-react';
import { BaseModal } from '../shared/BaseModal';
import { useGlobalContext } from '../../context/GlobalContext';
import { loadOcrData, loadAnnotations, saveOfflineFile, addToSyncQueue } from '../../services/storageService';
import { burnAnnotationsToPdf } from '../../services/pdfModifierService';
import { updateDriveFile, uploadFileToDrive } from '../../services/driveService';
import { getValidDriveToken } from '../../services/authService';
import { auth } from '../../firebase';

export const OcrCompletionModal = () => {
  const { ocrCompletion, clearOcrCompletion, addNotification } = useGlobalContext();
  const [isSaving, setIsSaving] = useState(false);

  if (!ocrCompletion) return null;

  const { fileId, filename, sourceBlob, stoppedAtPage } = ocrCompletion;
  const isStopped = !!stoppedAtPage;

  const handleSave = async (mode: 'overwrite' | 'copy') => {
    setIsSaving(true);
    try {
        // 1. Carregar dados processados
        const ocrData = await loadOcrData(fileId);
        const uid = auth.currentUser?.uid || 'guest';
        const annotations = await loadAnnotations(uid, fileId);

        // 2. Processar PDF ("Queimar" camadas)
        const newBlob = await burnAnnotationsToPdf(sourceBlob, annotations, ocrData);
        
        const accessToken = getValidDriveToken();
        const isLocal = fileId.startsWith('local-') || fileId.startsWith('native-');

        if (mode === 'overwrite') {
            if (!isLocal && accessToken) {
               await updateDriveFile(accessToken, fileId, newBlob);
            }
            // Atualiza cache offline
            await saveOfflineFile({ id: fileId, name: filename, mimeType: 'application/pdf' }, newBlob);
            
            // Se estiver offline e for arquivo de nuvem, enfileira
            if (!isLocal && !navigator.onLine) {
               await addToSyncQueue({ fileId, action: 'update', blob: newBlob, name: filename, mimeType: 'application/pdf' });
            }

            addNotification(isStopped ? "Progresso salvo no arquivo original." : "Arquivo original atualizado com texto pesquisável!", "success");
        } else {
            // Alterado para (1) para seguir padrão de versão
            // Se foi interrompido, adiciona sufixo (Parcial)
            const suffix = isStopped ? ' (Parcial)' : ' (1)';
            const newName = filename.replace(/\.pdf$/i, '') + suffix + '.pdf';
            
            if (!isLocal && accessToken) {
               await uploadFileToDrive(accessToken, newBlob, newName);
            } else {
               // Download direto para locais
               const url = URL.createObjectURL(newBlob);
               const a = document.createElement('a');
               a.href = url;
               a.download = newName;
               document.body.appendChild(a);
               a.click();
               document.body.removeChild(a);
               URL.revokeObjectURL(url);
            }
            addNotification(isStopped ? "Cópia parcial salva com sucesso!" : "Cópia com OCR salva com sucesso!", "success");
        }
        
        clearOcrCompletion();
    } catch (e: any) {
        console.error(e);
        addNotification(`Erro ao salvar: ${e.message}`, "error");
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <BaseModal
      isOpen={!!ocrCompletion}
      onClose={clearOcrCompletion}
      title={isStopped ? "Limite de Cota Atingido" : "OCR Concluído"}
      icon={isStopped ? <AlertTriangle size={20} className="text-yellow-500" /> : <CheckCircle size={20} className="text-green-500" />}
      maxWidth="max-w-md"
    >
      <div className="space-y-6">
        {isStopped ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl">
                <div className="flex items-start gap-3 mb-2">
                    <Hourglass size={20} className="text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-bold text-white mb-1">Processo Pausado na Página {stoppedAtPage}</h4>
                        <p className="text-xs text-text-sec leading-relaxed">
                            A chave de API atingiu o limite de requisições por minuto (RPM) ou diário. O processamento foi interrompido para evitar bloqueio.
                        </p>
                    </div>
                </div>
                <div className="mt-3 p-2 bg-yellow-500/5 rounded border border-yellow-500/10 text-[11px] text-yellow-200/80">
                    <strong>Recomendação:</strong> Salve o arquivo agora para não perder as páginas já processadas. Você pode continuar o processo amanhã ou mais tarde a partir da página {stoppedAtPage! + 1}.
                </div>
            </div>
        ) : (
            <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl flex items-start gap-3">
                <FileText size={20} className="text-green-500 shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-sm font-bold text-white mb-1">{filename}</h4>
                    <p className="text-xs text-text-sec">
                        O reconhecimento de texto foi finalizado com sucesso. O documento agora é pesquisável e selecionável.
                    </p>
                </div>
            </div>
        )}

        {isSaving ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                <Loader2 size={32} className="animate-spin text-brand" />
                <p className="text-sm text-text-sec animate-pulse">Gerando arquivo PDF...</p>
            </div>
        ) : (
            <div className="space-y-3">
                <button 
                    onClick={() => handleSave('overwrite')}
                    className="w-full bg-brand text-[#0b141a] p-4 rounded-xl font-bold flex items-center justify-between group hover:brightness-110 transition-all"
                >
                    <div className="flex items-center gap-3">
                        <Save size={20} />
                        <div className="text-left">
                            <span className="block text-sm">Salvar Progresso no Original</span>
                            <span className="block text-[10px] opacity-70 font-normal">
                                {isStopped ? 'Mantém o que foi feito até agora' : 'Substitui o arquivo atual'}
                            </span>
                        </div>
                    </div>
                </button>

                <button 
                    onClick={() => handleSave('copy')}
                    className="w-full bg-[#2c2c2c] text-white p-4 rounded-xl font-bold flex items-center justify-between group hover:bg-[#363636] border border-transparent hover:border-brand/30 transition-all"
                >
                    <div className="flex items-center gap-3">
                        <Copy size={20} className="text-gray-400 group-hover:text-white" />
                        <div className="text-left">
                            <span className="block text-sm">Salvar como Cópia</span>
                            <span className="block text-[10px] text-gray-500 font-normal">
                                {isStopped ? 'Cria novo arquivo (Parcial)' : 'Cria novo arquivo (1)'}
                            </span>
                        </div>
                    </div>
                </button>

                <button 
                    onClick={clearOcrCompletion}
                    className="w-full text-text-sec p-3 text-xs hover:text-white transition-colors"
                >
                    Manter apenas no cache local (Não salvar PDF)
                </button>
            </div>
        )}
        
        {!isStopped && (
            <div className="flex items-center gap-2 text-[10px] text-yellow-500/80 bg-yellow-500/5 p-2 rounded-lg justify-center">
                <AlertCircle size={12} />
                <span>Recomendamos salvar para não perder o processamento.</span>
            </div>
        )}
      </div>
    </BaseModal>
  );
};