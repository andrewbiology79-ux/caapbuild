import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initSafeArea } from './utils/safeArea';
import { isFolderSyncEnabled } from './storage/syncEngine';
import { installWriteHooks, setWritesEnabled } from './storage/writer';
import { installCategoryHooks } from './storage/categoryAuto';

initSafeArea();

// Folder sync: the database hooks must be in place before the first screen can change anything
if (isFolderSyncEnabled()) {
  setWritesEnabled(true);
  installWriteHooks();
  installCategoryHooks(); // Create ট্যাবের ক্যাটেগরি ও প্রশ্নপত্র -> Category/ ফোল্ডার (অটো)
}

createRoot(document.getElementById('root')!).render(<App />);
