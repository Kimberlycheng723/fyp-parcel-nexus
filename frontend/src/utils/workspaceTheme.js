export function workspaceThemeKey(userId) {
  return `parcel_nexus_theme:${userId || 'browser'}`;
}

export function readWorkspaceTheme(userId, storage) {
  try {
    const value = (storage || globalThis.localStorage)?.getItem(workspaceThemeKey(userId));
    return value === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveWorkspaceTheme(userId, theme, storage) {
  if (theme !== 'light' && theme !== 'dark') return;
  try {
    (storage || globalThis.localStorage)?.setItem(workspaceThemeKey(userId), theme);
  } catch { /* Theme switching remains available when browser storage is blocked. */ }
}
