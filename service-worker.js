const CACHE_NAME='bestcare-dashboard-v1-20260905-photo-consent-alert';
const APP_SHELL=[
  './',
  './index.html',
  './dashboard.css',
  './dashboard.js',
  './patient-summary.js',
  './patient-summary.css',
  './theme.css',
  './theme-boot.js',
  './splash.js',
  './treatment-plan.html',
  './treatment-plan.js',
  './plan-consent.html',
  './plan-consent.css',
  './plan-consent.js',
  './treatment-plans.html',
  './treatment-plans.js',
  './statistics.html',
  './statistics.js',
  './appointment-request.html',
  './appointment-request.js',
  './appointment-requests.html',
  './appointment-requests.js',
  './appointment-entry.html',
  './appointment-entry.css',
  './appointment-entry.js',
  './appointment-entry-core.js',
  './admin-notifications.html',
  './admin-notifications.js',
  './offline.html',
  './offline.js',
  './lab.html',
  './lab.js',
  './prescription.html',
  './prescription.css',
  './prescription-overrides.css',
  './prescription.js',
  './manifest.webmanifest',
  './best-care-logo.png',
  './assets/best-care-logo-header.png',
  './assets/treatment-plan-department-stamp.svg',
  './assets/treatment-plan-hero-v1.webp',
  './assets/fonts/IBMPlexSansArabic-Regular.ttf',
  './assets/fonts/IBMPlexSansArabic-Bold.ttf',
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
    const shellPage=url.pathname.endsWith('/treatment-plans.html')
      ?'./treatment-plans.html'
      :url.pathname.endsWith('/treatment-plan.html')
      ?'./treatment-plan.html'
      :url.pathname.endsWith('/plan-consent.html')
        ?'./plan-consent.html'
      :url.pathname.endsWith('/statistics.html')
        ?'./statistics.html'
        :url.pathname.endsWith('/appointment-request.html')
          ?'./appointment-request.html'
          :url.pathname.endsWith('/appointment-requests.html')
            ?'./appointment-requests.html'
          :url.pathname.endsWith('/appointment-entry.html')
            ?'./appointment-entry.html'
          :url.pathname.endsWith('/admin-notifications.html')
            ?'./admin-notifications.html'
          :url.pathname.endsWith('/lab.html')
            ?'./lab.html'
          :url.pathname.endsWith('/prescription.html')
            ?'./prescription.html'
            :'./index.html';
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

  // Core UI files are network-first so a freshly deployed HTML page never runs
  // against an older cached JavaScript/CSS bundle. The cache remains an offline
  // fallback, while patient and API data are still never cached above.
  if(url.origin===self.location.origin&&(
    request.destination==='script'||request.destination==='style'||
    /\.(?:js|css)$/i.test(url.pathname)
  )){
    event.respondWith(
      fetch(request)
        .then(response=>{
          if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));
          return response;
        })
        .catch(()=>caches.match(request))
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

self.addEventListener('push',event=>{
  let payload={};
  try{payload=event.data?.json?.()||{}}catch{payload={title:'تنبيه من أفضل عناية',body:event.data?.text?.()||''}}
  const title=payload.title||'تنبيه من أفضل عناية';
  const options={
    body:payload.body||'يوجد تحديث جديد داخل لوحة المتابعة.',
    icon:'./assets/icons/icon-192.png',
    badge:'./assets/icons/icon-192.png',
    tag:payload.tag||`bestcare-${payload.type||'update'}`,
    renotify:false,
    vibrate:[160,70,180],
    data:{url:payload.url||'./'}
  };
  const notify=self.registration.showNotification(title,options);
  const wakeOpenPages=self.clients.matchAll({type:'window',includeUncontrolled:true}).then(openClients=>{
    const message={type:'BESTCARE_REMOTE_SYNC',payload:{...payload,receivedAt:Date.now()}};
    openClients.forEach(client=>client.postMessage(message));
  });
  event.waitUntil(Promise.allSettled([notify,wakeOpenPages]));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'./',self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
      const existing=clients.find(client=>client.url.startsWith(self.location.origin));
      if(existing){existing.navigate(target);return existing.focus()}
      return self.clients.openWindow(target);
    })
  );
});
