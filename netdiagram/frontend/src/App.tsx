import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import UploadPage from './pages/UploadPage';

// Lazy-load DiagramPage so a cytoscape/module error doesn't crash the whole app
const DiagramPage = lazy(() => import('./pages/DiagramPage'));

function LoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1117', color: '#7c3aed', fontSize: '1.2rem' }}>
      ⏳ Loading diagram...
    </div>
  );
}

function ErrorBoundary({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1117', color: '#f87171', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: '2rem' }}>❌</div>
      <div>{message}</div>
      <button onClick={() => window.location.href = '/'} style={{ background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', padding: '0.5rem 1.5rem', cursor: 'pointer' }}>
        Back to Upload
      </button>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route
          path="/diagram"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <DiagramPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
