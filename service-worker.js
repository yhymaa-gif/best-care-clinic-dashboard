const CACHE_NAME='bestcare-treatment-plan-v1-20260724c';
const APP_SHELL=[
  './',
  './index.html',
  './treatment-plan.html',
  './offline.html',
  './manifest.webmanifest',
  './best-care-logo.png',
  './assets/treatment-plan-hero-v1.webp',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  // Patient data must always come from Netlify; never serve it from a cache.
  if(url.pathname.startsWith('/.netlify/functions/')||url.pathname.startsWith('/api/')){
    event.respondWith(fetch(request));
    return;
  }

  if(request.mode==='navigate'){
    const shellPage=url.pathname.endsWith('/treatment-plan.html')?'./treatment-plan.html':'./index.html';
    event.respondWith(
      fetch(request)
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(shellPage,copy));
          return response;
        })
        .catch(()=>caches.match(shellPage).then(response=>response||caches.match('./offline.html')))
    );
    return;
  }

  if(url.origin===self.location.origin){
    event.respondWith(
      caches.match(request).then(cached=>cached||fetch(request).then(response=>{
        if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));
        return response;
      }))
    );
  }
});
