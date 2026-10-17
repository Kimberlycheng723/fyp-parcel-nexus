import { useEffect, useLayoutEffect, useState } from 'react';
import { readWorkspaceTheme, saveWorkspaceTheme, workspaceThemeKey } from '../utils/workspaceTheme.js';

export function useWorkspaceTheme(userId) {
  const key = workspaceThemeKey(userId);
  const [choice, setChoice] = useState(() => ({ key, theme: readWorkspaceTheme(userId) }));
  const theme = choice.key === key ? choice.theme : readWorkspaceTheme(userId);

  // Applying before paint also themes dialogs rendered through portals.
  useLayoutEffect(() => {
    document.documentElement.dataset.workspaceTheme = theme;
    return () => { delete document.documentElement.dataset.workspaceTheme; };
  }, [theme]);

  useEffect(() => {
    function syncTheme(event) {
      if (event.key === key || event.key === null) {
        setChoice({ key, theme: readWorkspaceTheme(userId) });
      }
    }
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, [key, userId]);

  function setTheme(nextTheme) {
    if (nextTheme !== 'light' && nextTheme !== 'dark') return;
    setChoice({ key, theme: nextTheme });
    saveWorkspaceTheme(userId, nextTheme);
  }

  return [theme, setTheme];
}
