const DEFAULT_NOTIFICATION = {
  title: "Alfred",
  body: "Open Alfred to continue.",
  url: "/",
  notification_type: "general",
  source_service: "alfred",
  metadata: {}
};

const PAGE_ALIASES = {
  "/tasks": "/?page=todo-list",
  "/todo-list": "/?page=todo-list",
  "/goals": "/?page=my-goals",
  "/journal": "/?page=my-journal",
  "/habits": "/?page=my-habits",
  "/journey": "/?page=my-journey",
  "/team": "/?page=my-team",
  "/settings": "/?page=settings"
};

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event.data);
  const title = payload.title || DEFAULT_NOTIFICATION.title;
  const options = {
    body: payload.body || DEFAULT_NOTIFICATION.body,
    icon: "/alfred-logo.png",
    badge: "/alfred-logo.png",
    data: {
      url: payload.url || DEFAULT_NOTIFICATION.url,
      notification_type: payload.notification_type || DEFAULT_NOTIFICATION.notification_type,
      source_service: payload.source_service || DEFAULT_NOTIFICATION.source_service,
      metadata: payload.metadata || {}
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = resolveTargetUrl(event.notification.data?.url);

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windowClients) {
      if (client.url && new URL(client.url).origin === self.location.origin) {
        await client.focus();
        return client.navigate(targetUrl);
      }
    }

    return self.clients.openWindow(targetUrl);
  })());
});

function parsePushPayload(data) {
  if (!data) return DEFAULT_NOTIFICATION;

  try {
    return {
      ...DEFAULT_NOTIFICATION,
      ...data.json()
    };
  } catch (error) {
    return {
      ...DEFAULT_NOTIFICATION,
      body: data.text() || DEFAULT_NOTIFICATION.body
    };
  }
}

function resolveTargetUrl(url) {
  const rawUrl = typeof url === "string" && url.trim() ? url.trim() : "/";
  const aliased = PAGE_ALIASES[rawUrl] || rawUrl;
  return new URL(aliased, self.location.origin).href;
}
