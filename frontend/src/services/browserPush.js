import {
  deleteBrowserPushSubscription,
  getBrowserPushPublicKey,
  saveBrowserPushSubscription
} from "./api.js";

const SERVICE_WORKER_PATH = "/parcel-nexus-sw.js";

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);

  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function isBrowserPushSupported() {
  return Boolean(
    window.isSecureContext
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
  );
}

export async function hasBrowserPushSubscription() {
  if (!isBrowserPushSupported()) {
    return false;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  return Boolean(subscription);
}

async function getServiceWorkerRegistration() {
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
    scope: "/"
  });

  await navigator.serviceWorker.ready;
  return registration;
}

export async function enableBrowserPushForCurrentBrowser() {
  if (!isBrowserPushSupported()) {
    throw new Error(
      "Browser Push is not supported here. Use Parcel Nexus over HTTPS and, on iPhone or iPad, open the installed Home Screen app."
    );
  }

  const configuration = await getBrowserPushPublicKey();

  if (!configuration.configured || !configuration.public_key) {
    throw new Error("Browser Push is not configured on the Parcel Nexus server.");
  }

  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;

  if (permission !== "granted") {
    throw new Error("Browser notification permission was not granted.");
  }

  const registration = await getServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(configuration.public_key)
    });
  }

  await saveBrowserPushSubscription(subscription.toJSON());
  return subscription;
}

export async function disableBrowserPushForCurrentBrowser() {
  if (!isBrowserPushSupported()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  await deleteBrowserPushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
