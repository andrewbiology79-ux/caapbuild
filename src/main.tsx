import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { isFolderSyncEnabled } from './storage/syncEngine';
import { installWriteHooks, setWritesEnabled } from './storage/writer';

// Folder sync: the database hooks must be in place before the first screen can change anything
if (isFolderSyncEnabled()) {
  setWritesEnabled(true);
  installWriteHooks();
}

createRoot(document.getElementById('root')!).render(<App />);
