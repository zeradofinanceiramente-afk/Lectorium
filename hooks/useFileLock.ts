
import { useState, useCallback } from 'react';
import { acquireFileLock, releaseFileLock } from '../services/storageService';

export const useFileLock = (fileId: string) => {
  const [isLocked, setIsLocked] = useState(false);

  const lock = useCallback(async () => {
    const success = await acquireFileLock(fileId);
    setIsLocked(success);
    return success;
  }, [fileId]);

  const unlock = useCallback(async () => {
    await releaseFileLock(fileId);
    setIsLocked(false);
  }, [fileId]);

  return { isLocked, lock, unlock };
};
