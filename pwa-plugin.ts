// Minimalny plugin PWA (bez zależności): przy buildzie generuje service worker z listą wszystkich plików
// aplikacji (precache) i wersją wyliczoną z tej listy — nowy build = nowy SW = odświeżenie cache.

import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

const PUBLIC_FILES = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']

function swSource(version: string, files: string[]): string {
  return `// Wygenerowane przy buildzie — nie edytuj ręcznie.
const CACHE = 'kosztorys-${version}'
const PRECACHE = ${JSON.stringify(['./', ...files])}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kosztorys-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    // Strona: najpierw sieć (świeża wersja), offline — z cache
    event.respondWith(fetch(req).catch(() => caches.match('./', { ignoreSearch: true })))
    return
  }
  // Pliki (hashowane nazwy): najpierw cache
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
`
}

export function pwaPlugin(): Plugin {
  return {
    name: 'kosztorys-pwa',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = [...Object.keys(bundle).filter((f) => f !== 'sw.js'), ...PUBLIC_FILES].sort()
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(version, files) })
    },
  }
}
