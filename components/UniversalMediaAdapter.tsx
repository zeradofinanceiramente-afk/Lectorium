
import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { DriveFile } from '../types';
import { downloadDriveFile } from '../services/driveService';
import { universalConvertToPdf } from '../services/mediaAdapterService';
import { PdfViewer } from './PdfViewer';

interface Props {
  file: DriveFile;
  accessToken: string;
  uid: string;
  onBack: () => void;
  onToggleNavigation: () => void;
  onAuthError: () => void;
}

export const UniversalMediaAdapter: React.FC<Props> = ({ 
  file, accessToken, uid, onBack, onToggleNavigation, onAuthError 
}) => {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<'loading' | 'converting' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState("Preparando arquivo...");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        let sourceBlob = file.blob;

        // 1. Download se necessário
        if (!sourceBlob && accessToken) {
           setMessage("Baixando arquivo...");
           setStatus('loading');
           sourceBlob = await downloadDriveFile(accessToken, file.id);
        }

        if (!sourceBlob) throw new Error("Não foi possível carregar o arquivo fonte.");

        if (active) {
            setMessage("Convertendo formato...");
            setStatus('converting');
        }

        // 2. Conversão Universal
        const convertedBlob = await universalConvertToPdf(sourceBlob, file.name);
        
        if (active) {
            setPdfBlob(convertedBlob);
            setStatus('ready');
        }

      } catch (e: any) {
        console.error("Erro na conversão universal:", e);
        if (active) {
            setStatus('error');
            setErrorMsg(e.message || "Erro ao processar arquivo. O formato pode estar corrompido ou não ser suportado.");
        }
      }
    };

    load();

    return () => { active = false; };
  }, [file, accessToken]);

  if (status !== 'ready') {
      return (
          <div className="flex flex-col h-full items-center justify-center bg-bg text-text animate-in fade-in">
              {status === 'error' ? (
                  <div className="text-center p-6 bg-surface border border-red-500/20 rounded-2xl max-w-sm">
                      <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                          <AlertTriangle size={24} />
                      </div>
                      <h3 className="text-lg font-bold mb-2">Falha na Conversão</h3>
                      <p className="text-sm text-text-sec mb-6">{errorMsg}</p>
                      <button onClick={onBack} className="px-6 py-2 bg-surface border border-border hover:bg-white/5 rounded-full text-sm transition-colors">Voltar</button>
                  </div>
              ) : (
                  <div className="flex flex-col items-center">
                    <div className="relative mb-4">
                        <div className="absolute inset-0 bg-brand/20 rounded-full blur-xl animate-pulse"></div>
                        <Loader2 className="animate-spin text-brand relative z-10" size={48} />
                    </div>
                    <p className="text-lg font-bold animate-pulse">{message}</p>
                    <p className="text-sm text-text-sec mt-2 opacity-70">Transformando {file.name.split('.').pop()?.toUpperCase()} em PDF anotável...</p>
                  </div>
              )}
          </div>
      );
  }

  // Renderiza o visualizador de PDF com o Blob convertido
  return (
      <PdfViewer 
          accessToken={accessToken}
          fileId={file.id}
          fileName={file.name} // Mantém nome original
          fileParents={file.parents}
          uid={uid}
          onBack={onBack}
          fileBlob={pdfBlob!}
          isPopup={false}
          onToggleNavigation={onToggleNavigation}
          onAuthError={onAuthError}
      />
  );
};
