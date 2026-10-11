import './style.css';
import { start } from './editor/app.ts';

if (__PINTA_OFFLINE__ && 'serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    location.reload();
  });
  void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
}

void start();
