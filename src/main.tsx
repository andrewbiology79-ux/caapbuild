import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initSafeArea } from './utils/safeArea';
import { isFolderSyncEnabled } from './storage/syncEngine';
import { installWriteHooks, setWritesEnabled } from './storage/writer';
import { installCategoryWriteHooks, setCategoryWritesEnabled } from './storage/categoryWriter';

initSafeArea();

// Folder sync: the database hooks must be in place before the first screen can change anything
if (isFolderSyncEnabled()) {
  setWritesEnabled(true);
  installWriteHooks();
  setCategoryWritesEnabled(true);
  installCategoryWriteHooks();
}

createRoot(document.getElementById('root')!).render(<App />);
