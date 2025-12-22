
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DriveFile } from '../types';
import { downloadDriveFile } from '../services/driveService';
import { convertTiffToPdf } from '../services/tiffService';
import { PdfViewer } from './PdfViewer';

interface Props {
  file: DriveFile;
  accessToken: string;
  uid: string;
  onBack: () => void;
  onToggleNavigation: () => void;
  onAuthError: () => void;
}

export const TiffToPdfAdapter: React.FC<Props> = ({ 
  file, accessToken, uid, onBack, onToggleNavigation, onAuthError 
}) => {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<'loading' | 'converting' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        let tiffBlob = file.blob;

        // 1. Download se necessário
        if (!tiffBlob && accessToken) {
           setStatus('loading');
           tiffBlob = await downloadDriveFile(accessToken, file.id);
        }

        if (!tiffBlob) throw new Error("Não foi possível carregar o arquivo TIFF.");

        if (active) setStatus('converting');

        // 2. Converter para PDF
        const convertedBlob = await convertTiffToPdf(tiffBlob);
        
        if (active) {
            setPdfBlob(convertedBlob);
            setStatus('ready');
        }

      } catch (e: any) {
        console.error("Erro na conversão TIFF:", e);
        if (active) {
            setStatus('error');
            setErrorMsg(e.message || "Erro ao processar imagem.");
        }
      }
    };

    load();

    return () => { active = false; };
  }, [file, accessToken]);

  if (status !== 'ready') {
      return (
          <div className="flex flex-col h-full items-center justify-center bg-bg text-text">
              {status === 'error' ? (
                  <div className="text-center p-6">
                      <p className="text-red-500 font-bold mb-2">Erro</p>
                      <p className="text-text-sec">{errorMsg}</p>
                      <button onClick={onBack} className="mt-4 px-4 py-2 bg-surface border border-border rounded text-sm">Voltar</button>
                  </div>
              ) : (
                  <>
                    <Loader2 className="animate-spin text-brand mb-4" size={40} />
                    <p className="text-lg font-medium">{status === 'loading' ? 'Baixando Imagem...' : 'Convertendo TIFF para PDF...'}</p>
                    <p className="text-sm text-text-sec mt-2">Isso permite zoom e anotações.</p>
                  </>
              )}
          </div>
      );
  }

  // Renderiza o visualizador de PDF com o Blob convertido
  // Usamos o ID original para permitir salvar (overwrite vai converter o arquivo no Drive para PDF)
  return (
      <PdfViewer 
          accessToken={accessToken}
          fileId={file.id}
          fileName={file.name}
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
