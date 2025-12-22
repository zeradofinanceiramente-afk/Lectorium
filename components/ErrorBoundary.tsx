
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any | null;
}

/**
 * ErrorBoundary component to catch rendering errors in child components.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Fix: Explicitly declare properties to resolve "Property does not exist" errors
  public props: ErrorBoundaryProps;
  public state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("Uncaught error in ErrorBoundary:", error, errorInfo);
  }

  /**
   * Resets the error state and notifies the parent.
   */
  resetErrorBoundary = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    // Fix: Cast to any to resolve "Property 'setState' does not exist" error
    (this as any).setState({ hasError: false, error: null });
  }

  private getErrorMessage(error: any): string {
    if (!error) return "Erro desconhecido";
    
    try {
      if (error instanceof Error) return error.message;
      if (typeof error === 'string') return error;
      if (typeof error === 'object' && error !== null && 'message' in error) return String((error as any).message);
      return JSON.stringify(error);
    } catch (e) {
      return "Erro crítico ao processar erro";
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const errorMessage = this.getErrorMessage(this.state.error);

      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-6 text-center bg-bg text-text animate-in fade-in">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6 border border-red-500/20">
            <AlertTriangle size={40} />
          </div>
          <h2 className="text-2xl font-bold mb-2">Ops! Algo deu errado.</h2>
          <p className="text-text-sec max-w-md mb-8 leading-relaxed">
            Ocorreu um erro inesperado ao renderizar esta tela.
            <br />
            <span className="text-xs font-mono bg-surface px-2 py-1 rounded mt-2 inline-block border border-border text-red-400 max-w-full overflow-hidden text-ellipsis line-clamp-3">
              {errorMessage}
            </span>
          </p>
          
          <div className="flex gap-4">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-6 py-3 rounded-full border border-border hover:bg-surface transition-colors font-medium text-text"
            >
              <RefreshCw size={18} />
              Recarregar App
            </button>
            
            <button
              onClick={this.resetErrorBoundary}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-brand text-bg hover:brightness-110 transition-colors font-bold"
            >
              <Home size={18} />
              Voltar ao Início
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
