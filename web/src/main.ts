import './style.css';
import { start } from './editor/app.ts';

if (__PINTA_OFFLINE__ && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

void start();
