
import React, { useState } from 'react';
import { X, Book, Globe, FileText, Plus, Trash2, Check } from 'lucide-react';
import { Reference, ReferenceType } from '../../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (ref: Reference) => void;
  references: Reference[];
}

export const CitationModal: React.FC<Props> = ({ isOpen, onClose, onInsert, references }) => {
  const [activeTab, setActiveTab] = useState<ReferenceType>('book');
  
  // Form State
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [authors, setAuthors] = useState<{firstName: string, lastName: string}[]>([{firstName: '', lastName: ''}]);
  
  // Book Specific
  const [city, setCity] = useState('');
  const [publisher, setPublisher] = useState('');
  
  // Web Specific
  const [url, setUrl] = useState('');
  const [accessDate, setAccessDate] = useState('');

  // Article Specific
  const [journal, setJournal] = useState('');
  const [volume, setVolume] = useState('');
  const [issue, setIssue] = useState('');
  const [pages, setPages] = useState('');

  if (!isOpen) return null;

  const handleAddAuthor = () => {
    setAuthors([...authors, {firstName: '', lastName: ''}]);
  };

  const updateAuthor = (index: number, field: 'firstName' | 'lastName', value: string) => {
    const newAuthors = [...authors];
    newAuthors[index][field] = value;
    setAuthors(newAuthors);
  };

  const removeAuthor = (index: number) => {
    if (authors.length > 1) {
        setAuthors(authors.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = () => {
    // Basic validation
    if (!title || !year || !authors[0].lastName) {
        alert("Preencha ao menos o título, ano e sobrenome do primeiro autor.");
        return;
    }

    const newRef: Reference = {
        id: `ref-${Date.now()}`,
        type: activeTab,
        title,
        authors: authors.filter(a => a.lastName.trim() !== ''),
        year,
        city,
        publisher,
        url,
        accessDate,
        journal,
        volume,
        issue,
        pages
    };

    onInsert(newRef);
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setTitle('');
    setYear('');
    setAuthors([{firstName: '', lastName: ''}]);
    setCity('');
    setPublisher('');
    setUrl('');
    setAccessDate('');
    setJournal('');
    setVolume('');
    setIssue('');
    setPages('');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
       <div className="bg-[#1e1e1e] text-[#e3e3e3] rounded-3xl shadow-2xl w-full max-w-lg relative animate-in zoom-in-95 border border-[#444746] flex flex-col max-h-[90vh]">
          
          <div className="flex justify-between items-center p-6 border-b border-[#444746]">
            <h3 className="text-xl font-normal">Adicionar Citação</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
          </div>

          <div className="flex border-b border-[#444746]">
              <button onClick={() => setActiveTab('book')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'book' ? 'text-[#a8c7fa] border-b-2 border-[#a8c7fa]' : 'text-gray-400 hover:text-white'}`}>
                  <Book size={16} /> Livro
              </button>
              <button onClick={() => setActiveTab('article')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'article' ? 'text-[#a8c7fa] border-b-2 border-[#a8c7fa]' : 'text-gray-400 hover:text-white'}`}>
                  <FileText size={16} /> Artigo
              </button>
              <button onClick={() => setActiveTab('website')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'website' ? 'text-[#a8c7fa] border-b-2 border-[#a8c7fa]' : 'text-gray-400 hover:text-white'}`}>
                  <Globe size={16} /> Site
              </button>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              
              {/* Authors */}
              <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Autores</label>
                  {authors.map((author, index) => (
                      <div key={index} className="flex gap-2">
                          <input 
                            placeholder="Nome" 
                            className="flex-1 bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none"
                            value={author.firstName}
                            onChange={(e) => updateAuthor(index, 'firstName', e.target.value)}
                          />
                          <input 
                            placeholder="Sobrenome" 
                            className="flex-1 bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none"
                            value={author.lastName}
                            onChange={(e) => updateAuthor(index, 'lastName', e.target.value)}
                          />
                          {authors.length > 1 && (
                              <button onClick={() => removeAuthor(index)} className="p-2 text-red-400 hover:bg-red-400/10 rounded"><Trash2 size={16}/></button>
                          )}
                      </div>
                  ))}
                  <button onClick={handleAddAuthor} className="text-xs text-[#a8c7fa] flex items-center gap-1 hover:underline">
                      <Plus size={12} /> Adicionar autor
                  </button>
              </div>

              {/* Common Fields */}
              <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-300">Título</label>
                  <input 
                    className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
              </div>

              <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-300">Ano</label>
                  <input 
                    type="number"
                    className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
              </div>

              {/* Specific Fields */}
              {activeTab === 'book' && (
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                          <label className="text-sm font-medium text-gray-300">Cidade</label>
                          <input className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none" value={city} onChange={e => setCity(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                          <label className="text-sm font-medium text-gray-300">Editora</label>
                          <input className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none" value={publisher} onChange={e => setPublisher(e.target.value)} />
                      </div>
                  </div>
              )}

              {activeTab === 'website' && (
                  <>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-300">URL</label>
                        <input className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none" value={url} onChange={e => setUrl(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-300">Data de Acesso</label>
                        <input className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none" value={accessDate} onChange={e => setAccessDate(e.target.value)} placeholder="DD/MM/AAAA" />
                    </div>
                  </>
              )}

              {activeTab === 'article' && (
                  <>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-300">Periódico / Revista</label>
                        <input className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none" value={journal} onChange={e => setJournal(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-300">Volume</label>
                            <input className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none" value={volume} onChange={e => setVolume(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-300">Número</label>
                            <input className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none" value={issue} onChange={e => setIssue(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-300">Páginas</label>
                            <input className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm focus:border-[#a8c7fa] outline-none" value={pages} onChange={e => setPages(e.target.value)} placeholder="10-20" />
                        </div>
                    </div>
                  </>
              )}

          </div>

          <div className="p-6 border-t border-[#444746] flex justify-end gap-3">
              <button onClick={onClose} className="text-[#a8c7fa] font-medium px-6 py-2 hover:bg-[#a8c7fa]/10 rounded-full transition-colors border border-transparent">Cancelar</button>
              <button onClick={handleSubmit} className="bg-[#a8c7fa] text-[#0b141a] font-medium px-8 py-2 rounded-full hover:bg-[#d8e5ff] transition-colors flex items-center gap-2">
                  <Check size={16} /> Inserir
              </button>
          </div>
       </div>
    </div>
  );
};
