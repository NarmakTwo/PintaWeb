import { createHash } from 'node:crypto';
import { readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

async function builtFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? builtFiles(path) : [path];
  }));
  return nested.flat();
}

function serviceWorker(version: string, urls: string[]): string {
  return `const CACHE = ${JSON.stringify(`pinta-${version}`)};
const FILES = ${JSON.stringify(urls)};

async function usable(response) {
  if (!response || !response.redirected) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async url => {
      const response = await fetch(url);
      if (!response.ok || response.type !== 'basic') throw new Error(url);
      await cache.put(url, await usable(response));
    }));
    const index = await cache.match('/index.html');
    if (index) await cache.put('/', index.clone());
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = request.mode === 'navigate' ? '/index.html' : request;
  event.respondWith((async () => {
    const cached = await caches.match(key);
    if (cached) return usable(cached);
    const response = await fetch(request);
    const cacheable = response.ok && response.type === 'basic';
    const clean = await usable(response);
    if (cacheable) {
      const cache = await caches.open(CACHE);
      await cache.put(key, clean.clone());
      if (request.mode === 'navigate') await cache.put('/', clean.clone());
    }
    return clean;
  })());
});
`;
}

function offline(): Plugin {
  let outDir = '';
  return {
    name: 'pinta-offline',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const urls = (await builtFiles(outDir))
        .filter(file => !file.endsWith('sw.js'))
        .map(file => `/${relative(outDir, file).replaceAll('\\', '/')}`)
        .sort();
      const version = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 12);
      await writeFile(join(outDir, 'sw.js'), serviceWorker(version, urls));
    },
  };
}

export default defineConfig(({ command }) => ({
  define: { __PINTA_OFFLINE__: JSON.stringify(command === 'build') },
  plugins: [offline()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { target: 'es2022', sourcemap: false },
}));
