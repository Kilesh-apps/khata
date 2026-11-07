// Bump CACHE on every update (khata-v11 -> khata-v12), or installed phones keep the old version.
const CACHE='khata-v27';
const OCR_CACHE='khata-ocr-v2'; // bill reader files (~7 MB), downloaded on first use, kept across app updates
const FILES=['./','./index.html','./xlsx.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-192-maskable.png','./icon-512-maskable.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==OCR_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin) return;
  if(/\/(tesseract[^/]*\.js|eng\.traineddata\.gz)$/.test(u.pathname)){
    e.respondWith(caches.open(OCR_CACHE).then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(res=>{if(res.ok) c.put(e.request,res.clone());return res}))));
    return;
  }
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));
});
