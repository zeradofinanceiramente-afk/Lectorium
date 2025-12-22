
import React, { useEffect, useState } from 'react';
import { X, Wrench, AlertTriangle, CheckCircle, Copy, Server, Globe, Loader2, RefreshCw } from 'lucide-react';
import { BaseModal } from './shared/BaseModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface DependencyStatus {
  name: string;
  buildVersion: string; // Do package.json (O que você achou que instalou)
  requestedVersion: string; // Do ImportMap (O que você pediu pro CDN)
  resolvedVersion: string; // Do Network (O que o CDN te entregou de fato)
  status: 'match' | 'minor-diff' | 'major-diff' | 'missing' | 'loading' | 'network-error';
}

// Snapshot das versões de Build fornecidas no contexto (package.json)
const BUILD_VERSIONS: Record<string, string> = {
  // Core Frameworks
  'react': '^19.2.3',
  'react-dom': '^19.2.3',
  'vite': '^7.3.0',
  'typescript': '5.2.2',
  'firebase': '^12.7.0',
  '@google/genai': '^1.34.0',
  'pdfjs-dist': '4.8.69',

  // Tiptap Core & PM
  '@tiptap/react': '^2.11.5',
  '@tiptap/pm': '^2.11.5',
  '@tiptap/starter-kit': '^2.11.5',

  // Tiptap Extensions
  '@tiptap/extension-table': '^2.11.5',
  '@tiptap/extension-image': '^2.11.5',
  '@tiptap/extension-link': '^2.11.5',
  '@tiptap/extension-highlight': '^2.11.5',
  '@tiptap/extension-underline': '^2.11.5',
  '@tiptap/extension-text-align': '^2.11.5',
  '@tiptap/extension-placeholder': '^2.11.5',
  '@tiptap/extension-task-list': '^2.11.5',
  '@tiptap/extension-typography': '^2.11.5',
  '@tiptap/extension-code-block-lowlight': '^2.11.5',
  
  // Collaboration
  '@tiptap/extension-collaboration': '^2.11.5',
  '@tiptap/extension-collaboration-cursor': '^2.11.5',
  'yjs': '^13.6.28',
  'y-webrtc': '^10.3.0'
};

export const VersionDebugModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [dependencies, setDependencies] = useState<DependencyStatus[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (isOpen) analyzeVersions();
  }, [isOpen]);

  /**
   * Extrai versão semântica de URLs complexas de CDN.
   * Suporta formatos:
   * - https://esm.sh/v135/react@19.2.3/es2022/react.mjs
   * - https://esm.sh/react@19.2.3
   * - react@^19.2.0
   */
  const extractVersionFromString = (str: string): string => {
    if (!str) return 'Unknown';

    // 1. Tenta pegar pattern específico do esm.sh pinned version (/v123/pkg@1.2.3/...)
    // Isso é mais preciso pois ignora prefixos de build do CDN
    const specificUrlMatch = str.match(/\/v\d+\/.*?@(\d+\.\d+\.\d+.*?)(?:\/|$)/);
    if (specificUrlMatch) return specificUrlMatch[1];

    // 2. Tenta padrão genérico @x.x.x
    const genericMatch = str.match(/@(\d+\.\d+\.\d+.*?)(?:\/|$)/);
    if (genericMatch) return genericMatch[1];

    // 3. Fallback para caret/tilde se não for URL resolvida
    const semverMatch = str.match(/([\^~]?\d+\.\d+\.\d+)/);
    return semverMatch ? semverMatch[1] : 'Unknown';
  };

  /**
   * Resolve a versão real seguindo redirects HTTP (301/302).
   * Usa HEAD requests para performance e cache busting para precisão.
   */
  const resolveCdnVersion = async (url: string): Promise<string> => {
    if (!url || !url.startsWith('http')) return 'Local/Unknown';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
        // Estratégia 1: HEAD Request com Cache Reload
        // Força o navegador a verificar o servidor, seguindo redirects e obtendo a URL final (response.url)
        let res = await fetch(url, { 
            method: 'HEAD', 
            mode: 'cors', 
            cache: 'reload',
            signal: controller.signal 
        });

        // Fallback: Alguns CDNs ou firewalls bloqueiam HEAD ou retornam Opaque
        // Se falhar, tentamos GET (baixa o arquivo, mas garante a URL)
        if (!res.ok || res.type === 'opaque' || res.url === url) {
             res = await fetch(url, { 
                method: 'GET', 
                mode: 'cors',
                cache: 'reload', // Importante: Ignora cache local para ver se o 'latest' mudou
                signal: controller.signal
            });
        }
        
        clearTimeout(timeoutId);
        
        const finalUrl = res.url;
        
        // Se a URL final for igual à inicial, pode não ter tido redirect (versão pinned ou CDN não expõe)
        // Mas ainda tentamos extrair a versão da URL final
        return extractVersionFromString(finalUrl);

    } catch (e: any) {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') return 'Timeout';
        console.warn(`Failed to resolve ${url}`, e);
        return 'Network Error';
    }
  };

  const analyzeVersions = async () => {
    setIsAnalyzing(true);
    
    // 1. Ler Import Map do DOM
    let importMap: any = {};
    try {
      const script = document.querySelector('script[type="importmap"]');
      if (script && script.textContent) {
        importMap = JSON.parse(script.textContent).imports || {};
      }
    } catch (e) {
      console.error("Failed to parse importmap", e);
    }

    // 2. Processar cada dependência em paralelo
    const promises = Object.keys(BUILD_VERSIONS).map(async (pkg) => {
      const buildVer = BUILD_VERSIONS[pkg];
      
      // Tenta achar no importmap (pode ter barra no final ou não)
      // Normaliza para buscar tanto 'react' quanto 'react/'
      const runtimeUrl = importMap[pkg] || importMap[pkg + '/'];
      
      let requestedVer = 'Not in ImportMap';
      let resolvedVer = 'N/A';
      let status: DependencyStatus['status'] = 'match';
      
      if (runtimeUrl) {
          // Versão solicitada (o que está escrito no HTML)
          requestedVer = extractVersionFromString(runtimeUrl);
          
          // Versão resolvida (o que o servidor entregou)
          resolvedVer = await resolveCdnVersion(runtimeUrl);
      }

      if (requestedVer === 'Not in ImportMap') {
        status = 'missing';
      } else if (resolvedVer === 'Network Error' || resolvedVer === 'Timeout') {
        status = 'network-error';
      } else {
        // Limpeza para comparação (remove ^, ~ e sufixos de build)
        const cleanBuild = buildVer.replace(/[\^~]/g, '').split('.')[0];
        const cleanResolved = resolvedVer.replace(/[\^~]/g, '').split('.')[0];

        // Comparação Semântica Básica
        if (cleanBuild !== cleanResolved && cleanBuild !== '*' && resolvedVer !== 'Unknown') {
          // Major version mismatch (Ex: Pediu 18, veio 19)
          status = 'major-diff'; 
        } else if (buildVer.replace(/[\^~]/g, '') !== resolvedVer.replace(/[\^~]/g, '') && cleanBuild !== '*') {
          // Minor/Patch mismatch (Ex: Pediu 18.2.0, veio 18.2.7) - Isso é bom geralmente
          status = 'minor-diff';
        }
      }

      return {
        name: pkg,
        buildVersion: buildVer,
        requestedVersion: requestedVer,
        resolvedVersion: resolvedVer,
        status
      };
    });

    const resolvedResults = await Promise.all(promises);
    setDependencies(resolvedResults);
    setIsAnalyzing(false);
  };

  const copyReport = () => {
    const report = dependencies.map(d => 
      `[${d.status.toUpperCase()}] ${d.name}: Build(${d.buildVersion}) | Requested(${d.requestedVersion}) | ACTUAL(${d.resolvedVersion})`
    ).join('\n');
    navigator.clipboard.writeText(report);
    alert("Relatório técnico copiado!");
  };

  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Diagnóstico de Runtime"
      icon={<Wrench size={20} />}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4">
        <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-xl flex items-start gap-3">
           <RefreshCw className={`text-blue-500 shrink-0 mt-0.5 ${isAnalyzing ? 'animate-spin' : ''}`} size={18} />
           <div className="text-xs text-blue-200/80">
              <strong className="block text-blue-400 mb-1">Verificação em Tempo Real (Network Trace)</strong>
              O sistema realiza um rastreamento ativo (HEAD request) para identificar redirecionamentos de CDN.
              <br/>
              A coluna <strong>"Real (CDN)"</strong> mostra a versão exata que foi entregue pelo servidor, ignorando o cache local.
           </div>
        </div>

        <div className="border border-[#333] rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 bg-[#1a1a1a] p-3 text-xs font-bold text-text-sec uppercase tracking-wider border-b border-[#333]">
                <div className="col-span-3">Biblioteca</div>
                <div className="col-span-2 flex items-center gap-1"><Server size={12}/> Build (NPM)</div>
                <div className="col-span-2 text-gray-500">Solicitado (HTML)</div>
                <div className="col-span-3 flex items-center gap-1 text-white"><Globe size={12}/> Real (CDN)</div>
                <div className="col-span-2 text-right">Status</div>
            </div>
            
            {isAnalyzing ? (
                <div className="p-8 flex justify-center items-center gap-3 text-text-sec">
                    <Loader2 className="animate-spin" /> Resolvendo redirecionamentos do CDN...
                </div>
            ) : (
                <div className="divide-y divide-[#333] bg-[#1e1e1e]">
                    {dependencies.map((dep, idx) => (
                        <div key={idx} className="grid grid-cols-12 p-3 text-sm items-center hover:bg-white/5 transition-colors">
                            <div className="col-span-3 font-mono text-brand font-bold truncate pr-2" title={dep.name}>{dep.name}</div>
                            
                            {/* Build Version */}
                            <div className="col-span-2 text-gray-400 font-mono text-xs">{dep.buildVersion}</div>
                            
                            {/* Requested (ImportMap) */}
                            <div className="col-span-2 text-gray-500 font-mono text-xs opacity-70">{dep.requestedVersion}</div>
                            
                            {/* Actual Resolved */}
                            <div className="col-span-3 font-mono text-xs font-bold flex items-center gap-2">
                                <span className={
                                    dep.status === 'major-diff' ? 'text-red-400' : 
                                    dep.status === 'network-error' ? 'text-yellow-500' : 
                                    'text-green-400'
                                }>
                                    {dep.resolvedVersion}
                                </span>
                            </div>

                            <div className="col-span-2 text-right flex justify-end">
                                {dep.status === 'match' && <span className="bg-green-500/20 text-green-500 px-2 py-0.5 rounded text-[10px] font-bold border border-green-500/30">IGUAL</span>}
                                {dep.status === 'minor-diff' && <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-500/30">ATUALIZADO</span>}
                                {dep.status === 'major-diff' && <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-[10px] font-bold border border-red-500/30 animate-pulse">CRÍTICO</span>}
                                {dep.status === 'missing' && <span className="bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded text-[10px] font-bold">MISSING</span>}
                                {dep.status === 'network-error' && <span className="bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded text-[10px] font-bold">ERRO REDE</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        <div className="flex justify-end pt-2">
            <button 
                onClick={copyReport}
                disabled={isAnalyzing}
                className="flex items-center gap-2 text-xs text-text-sec hover:text-white bg-[#2c2c2c] hover:bg-[#3c3c3c] px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
                <Copy size={14} /> Copiar Diagnóstico Completo
            </button>
        </div>
      </div>
    </BaseModal>
  );
};
