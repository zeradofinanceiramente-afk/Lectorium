
import { useEffect, useState } from 'react';
import { usePdfContext } from '../context/PdfContext';
import { OcrStatus } from '../services/ocrManager';

interface UsePageOcrProps {
  pageNumber: number;
}

export const usePageOcr = ({ pageNumber }: UsePageOcrProps) => {
  const { ocrMap, ocrStatusMap, triggerOcr } = usePdfContext();
  const [status, setStatus] = useState<OcrStatus>('idle');

  useEffect(() => {
    const currentStatus = ocrStatusMap[pageNumber] || 'idle';
    setStatus(currentStatus);
  }, [pageNumber, ocrStatusMap]);

  return { 
    status, 
    ocrData: ocrMap[pageNumber] || [], 
    requestOcr: () => triggerOcr(pageNumber) 
  };
};
