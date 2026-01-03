
import { useEffect, useState } from 'react';
import { usePdfContext } from '../context/PdfContext';

export type OcrStatus = 'idle' | 'processing' | 'done' | 'error';

interface UsePageOcrProps {
  pageNumber: number;
}

export const usePageOcr = ({ pageNumber }: UsePageOcrProps) => {
  const { ocrMap, ocrStatusMap, triggerOcr } = usePdfContext();
  const [status, setStatus] = useState<OcrStatus>('idle');

  useEffect(() => {
    const currentStatus = ocrStatusMap[pageNumber] || 'idle';
    // Cast string from map to OcrStatus if necessary, assuming ocrStatusMap values align
    setStatus(currentStatus as OcrStatus);
  }, [pageNumber, ocrStatusMap]);

  return { 
    status, 
    ocrData: ocrMap[pageNumber] || [], 
    requestOcr: () => triggerOcr(pageNumber) 
  };
};
