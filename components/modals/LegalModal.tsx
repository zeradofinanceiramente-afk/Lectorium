
import React, { useState, useEffect } from 'react';
import { Scale, Shield, FileText, Lock, Cloud, Database } from 'lucide-react';
import { BaseModal } from '../shared/BaseModal';

export type LegalTab = 'terms' | 'privacy';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalTab;
}

export const LegalModal: React.FC<Props> = ({ isOpen, onClose, initialTab = 'privacy' }) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const PrivacyContent = () => (
    <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
      <div className="bg-brand/5 border border-brand/20 p-4 rounded-xl">
        <h4 className="text-brand font-bold flex items-center gap-2 mb-2">
          <Lock size={16} /> Arquitetura Local-First (Privacidade Absoluta)
        </h4>
        <p>
          O Lectorium foi construído com a privacidade como pilar central. 
          <strong>Nós não possuímos servidores que armazenam seus arquivos ou o conteúdo dos seus documentos.</strong>
          Tudo o que você cria ou edita permanece no seu dispositivo ou no seu Google Drive pessoal.
        </p>
      </div>

      <div className="space-y-4">
        <section>
          <h4 className="text-white font-bold mb-2 flex items-center gap-2"><Cloud size={16}/> 1. Google Drive & Autenticação</h4>
          <ul className="list-disc pl-5 space-y-1 text-text-sec">
            <li>Utilizamos o Firebase Auth apenas para gerenciar o login seguro com o Google.</li>
            <li>A integração com o Google Drive é direta entre o seu navegador e a API do Google.</li>
            <li>O token de acesso é salvo localmente no seu navegador e nunca é compartilhado.</li>
            <li>Solicitamos apenas permissões para criar e editar arquivos que o próprio aplicativo criou ou abriu.</li>
          </ul>
        </section>

        <section>
          <h4 className="text-white font-bold mb-2 flex items-center gap-2"><Database size={16}/> 2. Armazenamento Local</h4>
          <p className="text-text-sec">
            Para permitir o funcionamento offline (PWA), armazenamos cópias temporárias dos seus arquivos recentes utilizando o IndexedDB do seu navegador. Você pode limpar esses dados a qualquer momento nas configurações do aplicativo.
          </p>
        </section>

        <section>
          <h4 className="text-white font-bold mb-2 flex items-center gap-2"><Shield size={16}/> 3. Inteligência Artificial (Gemini)</h4>
          <p className="text-text-sec">
            Ao utilizar funcionalidades de IA:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-text-sec mt-1">
            <li>O texto do documento é enviado para a API do Google Gemini para processamento.</li>
            <li>Se você utiliza sua própria Chave de API, a interação está sujeita aos termos de uso da API do Google, garantindo que seus dados não sejam usados para treinar modelos públicos (conforme política da Google para Enterprise/API paga).</li>
            <li>Não armazenamos o histórico das suas conversas com a IA em servidores externos.</li>
          </ul>
        </section>
      </div>
    </div>
  );

  const TermsContent = () => (
    <div className="space-y-6 text-sm text-gray-300 leading-relaxed">
      <p>
        Última atualização: Fevereiro de 2025. Ao utilizar o Lectorium, você concorda com os termos abaixo.
      </p>

      <section>
        <h4 className="text-white font-bold mb-2">1. Uso do Serviço</h4>
        <p className="text-text-sec">
          O Lectorium é uma ferramenta de produtividade acadêmica fornecida "como está" (as-is). 
          Embora nos esforcemos para garantir a estabilidade e segurança, não garantimos que o serviço será ininterrupto ou livre de erros.
        </p>
      </section>

      <section>
        <h4 className="text-white font-bold mb-2">2. Responsabilidade pelo Conteúdo</h4>
        <p className="text-text-sec">
          Você é o único responsável pelos arquivos, documentos e dados que processa através do Lectorium. 
          Como não temos acesso aos seus arquivos, não realizamos moderação de conteúdo.
        </p>
      </section>

      <section>
        <h4 className="text-white font-bold mb-2">3. Integridade Acadêmica</h4>
        <p className="text-text-sec">
          As ferramentas de IA e formatação ABNT são auxiliares. O usuário é responsável por revisar as citações, 
          referências e textos gerados para garantir a precisão e conformidade com as normas institucionais e éticas.
        </p>
      </section>

      <section>
        <h4 className="text-white font-bold mb-2">4. Propriedade Intelectual</h4>
        <p className="text-text-sec">
          O software Lectorium é propriedade de seus desenvolvedores. O conteúdo criado por você utilizando a ferramenta pertence exclusivamente a você.
        </p>
      </section>

      <section>
        <h4 className="text-white font-bold mb-2">5. Limitação de Responsabilidade</h4>
        <p className="text-text-sec">
          Em nenhuma circunstância o Lectorium ou seus desenvolvedores serão responsáveis por quaisquer danos diretos, indiretos, incidentais ou consequenciais resultantes do uso ou incapacidade de usar o serviço, incluindo perda de dados.
        </p>
      </section>
    </div>
  );

  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Informações Legais"
      icon={<Scale size={20} />}
      maxWidth="max-w-2xl"
      footer={
        <button onClick={onClose} className="w-full bg-[#2c2c2c] hover:bg-[#3c3c3c] text-white py-2 rounded-xl transition-colors font-medium">
          Entendi
        </button>
      }
    >
      <div className="flex border-b border-[#444746] mb-6">
         <button 
           onClick={() => setActiveTab('privacy')}
           className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'privacy' ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-white'}`}
         >
            <Shield size={16} /> Política de Privacidade
         </button>
         <button 
           onClick={() => setActiveTab('terms')}
           className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'terms' ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-white'}`}
         >
            <FileText size={16} /> Termos de Serviço
         </button>
      </div>

      <div className="custom-scrollbar pr-2 max-h-[60vh] overflow-y-auto">
        {activeTab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
      </div>
    </BaseModal>
  );
};
