import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import { AuthProvider } from '@/features/auth/AuthContext';
import { warmUpTts } from '@/lib/tts/speak';
import './index.css';

// Trigger voice-list loading early so the first speakChinese() does not
// race with an empty getVoices() result.
warmUpTts();

// Ask the browser / WebView to keep our IndexedDB from being evicted under
// storage pressure. Honored on Android/Chromium; best-effort on iOS WebKit
// (which is why we also ship a file export/import backup as a safety net).
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persist();
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <Toaster position="bottom-right" richColors closeButton />
    </BrowserRouter>
  </StrictMode>,
);
