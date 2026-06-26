// ============================================================
// Service Worker - سيستم مس الاء رمضان
// ============================================================

const CACHE_NAME = 'teacher-system-cache-v2';

// الملفات الثابتة التي يتم حفظها مسبقاً
const PRECACHE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// تثبيت الـ Service Worker وحفظ الملفات الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_FILES).catch((err) => {
        console.warn('[SW] Pre-cache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// تفعيل وحذف الكاش القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// إدارة الطلبات (Fetch)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل طلبات الـ API الخارجية أو Firebase وطلبات غير الـ GET
  if (
    url.origin !== location.origin || 
    request.method !== 'GET' ||
    url.pathname.startsWith('/firestore') ||
    url.pathname.startsWith('/googleapis')
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // 1. إذا كان الملف موجوداً في الكاش
      if (cachedResponse) {
        // نرجعه فوراً، ونحدثه في الخلفية للاستخدام القادم (Stale-While-Revalidate)
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // 2. إذا لم يكن موجوداً، نجيبه من الشبكة ونحفظه
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // 3. في حالة عدم وجود إنترنت
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        // إرجاع استجابة فارغة بدلاً من undefined لمنع تعليق الطلب
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

