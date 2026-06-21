const SERVICE_WORKER_URL = '/sw.js';

export function getNotificationSupport() {
  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';
  const isSecureContext = hasWindow && window.isSecureContext;
  const isLocalhost = hasWindow && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const hasNotification = hasWindow && 'Notification' in window;
  const hasServiceWorker = hasNavigator && 'serviceWorker' in navigator;
  const hasPushManager = hasWindow && 'PushManager' in window;
  const supported = Boolean((isSecureContext || isLocalhost) && hasNotification && hasServiceWorker && hasPushManager);

  return {
    supported,
    permission: hasNotification ? window.Notification.permission : 'unsupported',
    isSecureContext: Boolean(isSecureContext || isLocalhost),
    hasNotification,
    hasServiceWorker,
    hasPushManager,
    isIos: isIos(),
    isStandalone: isStandalone()
  };
}

export async function getNotificationStatus(apiUrl, userNumber) {
  const response = await fetch(`${apiUrl}/api/notifications/status?user_number=${encodeURIComponent(userNumber)}`);
  if (!response.ok) {
    throw new Error(await readError(response, 'Could not load notification status.'));
  }
  return response.json();
}

export async function enableNotifications(apiUrl, userNumber, deviceLabel) {
  const support = getNotificationSupport();
  if (!support.supported) {
    throw new Error('This browser does not support Alfred notifications yet.');
  }

  const status = await getNotificationStatus(apiUrl, userNumber);
  if (!status.vapid_public_key) {
    throw new Error('Alfred notification keys are not configured yet.');
  }

  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  await navigator.serviceWorker.ready;

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription = existingSubscription || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(status.vapid_public_key)
  });

  const payload = subscription.toJSON();
  const response = await fetch(`${apiUrl}/api/notifications/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_number: userNumber,
      endpoint: payload.endpoint,
      keys: {
        p256dh: payload.keys?.p256dh,
        auth: payload.keys?.auth
      },
      browser: getBrowserName(),
      platform: navigator.platform || null,
      device_label: deviceLabel || getDefaultDeviceLabel()
    })
  });

  if (!response.ok) {
    throw new Error(await readError(response, 'Could not save this device for notifications.'));
  }

  return response.json();
}

export async function disableNotifications(apiUrl, userNumber) {
  let endpoint = null;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (subscription) {
      endpoint = subscription.endpoint;
      await subscription.unsubscribe();
    }
  }

  const response = await fetch(`${apiUrl}/api/notifications/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_number: userNumber,
      endpoint
    })
  });

  if (!response.ok) {
    throw new Error(await readError(response, 'Could not disable notifications for this device.'));
  }

  return response.json();
}

export async function updateNotificationPreferences(apiUrl, userNumber, updates) {
  const response = await fetch(`${apiUrl}/api/notifications/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_number: userNumber,
      ...updates
    })
  });

  if (!response.ok) {
    throw new Error(await readError(response, 'Could not update notification preferences.'));
  }

  return response.json();
}

export async function sendTestNotification(apiUrl, userNumber) {
  const response = await fetch(`${apiUrl}/api/notifications/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_number: userNumber,
      title: 'Alfred notifications are ready',
      body: 'Tap to open your Alfred settings.',
      url: '/settings',
      notification_type: 'test',
      source_service: 'settings'
    })
  });

  if (!response.ok) {
    throw new Error(await readError(response, 'Could not send a test notification.'));
  }

  return response.json();
}

export function getIosInstallHint() {
  const support = getNotificationSupport();
  if (!support.isIos || support.isStandalone) return null;
  return 'On iPhone and iPad, Alfred notifications require the app to be added to your Home Screen first.';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function readError(response, fallback) {
  try {
    const data = await response.json();
    return data.detail || data.error || fallback;
  } catch (error) {
    return fallback;
  }
}

function getBrowserName() {
  const ua = navigator.userAgent || '';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('Firefox/')) return 'Firefox';
  return 'Unknown browser';
}

function getDefaultDeviceLabel() {
  const browser = getBrowserName();
  const platform = navigator.platform || 'this device';
  return `${browser} on ${platform}`;
}

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
