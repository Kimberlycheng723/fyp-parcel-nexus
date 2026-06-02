export function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function replaceNavigate(path) {
  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function getCurrentPath() {
  return window.location.pathname;
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
