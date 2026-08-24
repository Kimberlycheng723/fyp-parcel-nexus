self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {
      title: "Parcel Nexus",
      body: "You have a new notification."
    };
  }

  const title = payload.title || "Parcel Nexus";
  const options = {
    body: payload.body || "You have a new notification.",
    data: {
      url: payload.data?.url || "/dashboard",
      notification_id: payload.data?.notification_id || null,
      type: payload.data?.type || null,
      related_parcel_id: payload.data?.related_parcel_id || null
    },
    tag: payload.data?.notification_id
      ? `parcel-nexus-${payload.data.notification_id}`
      : undefined
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const hasFocusedParcelNexusWindow = windowClients.some(
          (client) => client.visibilityState === "visible" && client.focused === true
        );

        if (hasFocusedParcelNexusWindow) {
          return undefined;
        }

        return self.registration.showNotification(title, options);
      })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const destination = new URL(
    event.notification.data?.url || "/dashboard",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        const sameOriginClient = windowClients.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });

        if (sameOriginClient) {
          if ("navigate" in sameOriginClient) {
            await sameOriginClient.navigate(destination);
          }

          return sameOriginClient.focus();
        }

        return self.clients.openWindow(destination);
      })
  );
});
