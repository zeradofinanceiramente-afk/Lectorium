import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Conditional Mobile Debugger (Eruda)
const params = new URLSearchParams(window.location.search);
if (params.get('eruda') === 'true' || params.get('debug') === 'true') {
  const script = document.createElement('script');
  script.src = "https://cdn.jsdelivr.net/npm/eruda";
  script.onload = () => {
    const w = window as any;
    if (w.eruda) {
      w.eruda.init({
        defaults: {
          theme: 'Dracula'
        }
      });
      // Custom Amoled Style Injection
      if (w.eruda.util) {
        w.eruda.util.evalCss(`
          .eruda-dev-tools { --eruda-background: #000000; }
          .eruda-dev-tools .eruda-nav-bar { background-color: #000000 !important; border-bottom: 1px solid #333; }
          .eruda-dev-tools .eruda-content { background-color: #000000 !important; }
          .eruda-dev-tools .eruda-entry-btn { background-color: #000000 !important; border: 1px solid #333; color: #fff; }
        `);
      }
    }
  };
  document.body.appendChild(script);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Alterado de '/sw.js' para './sw.js' para evitar problemas de origem em previews
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}