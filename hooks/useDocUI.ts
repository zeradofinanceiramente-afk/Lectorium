
import { useState, useCallback } from 'react';

export type DocRegion = 'body' | 'header' | 'footer';

export const useDocUI = () => {
  const [modals, setModals] = useState({
    findReplace: false,
    imageOptions: false,
    pageSetup: false,
    wordCount: false,
    language: false,
    pageNumber: false,
    citation: false,
    share: false,
    help: false,
    symbols: false,
    history: false,
    tableProperties: false,
    headerFooter: false,
    styleConfig: false,
    columns: false,
    footnote: false
  });

  const [sidebars, setSidebars] = useState({
    comments: false,
    aiChat: false,
    outline: false,
    imageOptions: false
  });

  const [modes, setModes] = useState({
    suggestion: false,
    dictation: false,
    focus: false
  });

  const toggleModal = useCallback((name: keyof typeof modals, value?: boolean) => {
    setModals(prev => ({ ...prev, [name]: value !== undefined ? value : !prev[name] }));
  }, []);

  const toggleSidebar = useCallback((name: keyof typeof sidebars, value?: boolean) => {
    setSidebars(prev => ({ ...prev, [name]: value !== undefined ? value : !prev[name] }));
  }, []);

  const toggleMode = useCallback((name: keyof typeof modes, value?: boolean) => {
    setModes(prev => ({ ...prev, [name]: value !== undefined ? value : !prev[name] }));
  }, []);

  return {
    modals,
    sidebars,
    modes,
    toggleModal,
    toggleSidebar,
    toggleMode
  };
};
