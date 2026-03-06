import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('[NetDiagram] main.tsx loaded, mounting React...');

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('[NetDiagram] ERROR: #root element not found!');
} else {
  console.log('[NetDiagram] #root found, calling createRoot...');
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  console.log('[NetDiagram] render() called successfully');
}
