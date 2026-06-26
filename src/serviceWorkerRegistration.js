// ============================================================
// Service Worker Registration
// بيخلي الـ App يشتغل زي App حقيقي على الموبايل
// ============================================================

export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/sw.js`;

      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('[App] Service Worker registered:', registration.scope);

          // لما يلاقي update جديد
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;

            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // في update جديد متاح
                  console.log('[App] New update available! Will be active on next load.');
                  
                  // إشعار للمستخدم بالـ update (اختياري)
                  if (window.__swUpdateCallback) {
                    window.__swUpdateCallback(registration);
                  }
                } else {
                  // أول مرة يتنصب - الـ App جاهز للـ offline
                  console.log('[App] App is now available offline!');
                }
              }
            };
          };
        })
        .catch((error) => {
          console.error('[App] Service Worker registration failed:', error);
        });

      // لما يرجع الإنترنت بعد انقطاع
      window.addEventListener('online', () => {
        console.log('[App] Back online - syncing...');
      });

      // لما ينقطع الإنترنت
      window.addEventListener('offline', () => {
        console.log('[App] Offline mode activated');
      });
    });
  }
}

export function unregisterSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error('[App] SW unregister failed:', error);
      });
  }
}
