
import React from 'react';
import { Editor } from '@tiptap/react';
import { PageSetupModal } from '../modals/PageSetupModal';
import { WordCountModal } from '../modals/WordCountModal';
import { CitationModal } from '../modals/CitationModal';
import { ShareModal } from '../modals/ShareModal';
import { ColumnsModal } from '../modals/ColumnsModal';
import { HeaderFooterModal } from '../modals/HeaderFooterModal';
import { VersionHistoryModal } from '../modals/VersionHistoryModal';
import { FootnoteModal } from '../modals/FootnoteModal';
import { TablePropertiesModal } from '../modals/TablePropertiesModal';
import { LanguageModal } from '../modals/LanguageModal';
import { PageNumberModal } from '../modals/PageNumberModal';
import { Reference, EditorStats } from '../../../types';

interface DocModalsProps {
  modals: any;
  toggleModal: (name: string, value?: boolean) => void;
  editor: Editor;
  pageLayout: any;
  stats: EditorStats;
  references: Reference[];
  setReferences: (fn: (prev: Reference[]) => Reference[]) => void;
  fileId: string;
  fileName: string;
  isLocalFile: boolean;
  activeHeaderFooterTab: 'header' | 'footer';
  handleHeaderFooterApply: (h: string, f: string) => void;
  handleVersionRestore: (content: any) => void;
  insertFootnote: (content: string) => void;
  handleApplyColumns: (count: number) => void;
  spellCheck: boolean;
  setSpellCheck: (v: boolean) => void;
}

export const DocModals: React.FC<DocModalsProps> = ({
  modals,
  toggleModal,
  editor,
  pageLayout,
  stats,
  references,
  setReferences,
  fileId,
  fileName,
  isLocalFile,
  activeHeaderFooterTab,
  handleHeaderFooterApply,
  handleVersionRestore,
  insertFootnote,
  handleApplyColumns,
  spellCheck,
  setSpellCheck
}) => {
  return (
    <>
       <PageSetupModal 
         isOpen={modals.pageSetup} 
         initialSettings={pageLayout.pageSettings} 
         initialViewMode={pageLayout.viewMode} 
         onClose={() => toggleModal('pageSetup', false)} 
         onApply={(s, v) => { pageLayout.setPageSettings(s); pageLayout.setViewMode(v); toggleModal('pageSetup', false); }} 
       />
       <WordCountModal 
         isOpen={modals.wordCount} 
         onClose={() => toggleModal('wordCount', false)} 
         stats={stats} 
       />
       <CitationModal 
         isOpen={modals.citation} 
         onClose={() => toggleModal('citation', false)} 
         onInsert={ref => setReferences(prev => [...prev, ref])} 
         references={references} 
       />
       <ShareModal 
         isOpen={modals.share} 
         onClose={() => toggleModal('share', false)} 
         fileId={fileId} 
         fileName={fileName} 
         isLocal={isLocalFile} 
       />
       <ColumnsModal 
         isOpen={modals.columns} 
         onClose={() => toggleModal('columns', false)} 
         onApply={handleApplyColumns} 
       />
       <HeaderFooterModal 
          isOpen={modals.headerFooter} 
          onClose={() => toggleModal('headerFooter', false)} 
          initialHeader={pageLayout.pageSettings.headerText}
          initialFooter={pageLayout.pageSettings.footerText}
          activeTab={activeHeaderFooterTab}
          onApply={handleHeaderFooterApply}
       />
       <TablePropertiesModal 
          isOpen={modals.tableProperties} 
          onClose={() => toggleModal('tableProperties', false)} 
          editor={editor} 
       />
       <VersionHistoryModal 
          isOpen={modals.history} 
          onClose={() => toggleModal('history', false)} 
          fileId={fileId}
          onRestore={handleVersionRestore}
          currentContent={editor?.getJSON()}
       />
       <FootnoteModal 
          isOpen={modals.footnote} 
          onClose={() => toggleModal('footnote', false)} 
          onInsert={insertFootnote} 
       />
       <LanguageModal
          isOpen={modals.language}
          currentLanguage="pt-BR"
          onSelect={() => {}}
          onClose={() => toggleModal('language', false)}
       />
       <PageNumberModal 
          isOpen={modals.pageNumber}
          onClose={() => toggleModal('pageNumber', false)}
          onApply={(config) => {
              pageLayout.setPageSettings((prev: any) => ({ ...prev, pageNumber: config }));
              toggleModal('pageNumber', false);
          }}
       />
    </>
  );
};
