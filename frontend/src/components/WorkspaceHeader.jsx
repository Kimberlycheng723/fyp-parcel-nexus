import { Bell, Building2, Command, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { navigate } from '../utils/navigation.js';
import { workspacePageTitle, workspaceSearchConfig } from '../utils/workspaceHeader.js';

export function WorkspaceHeader({ path, role, unreadCount = 0, onOpenMenu, theme = 'light', onToggleTheme }) {
  const [search, setSearch] = useState('');
  const searchRef = useRef(null), config = workspaceSearchConfig(role);
  useEffect(() => {
    const focusSearch = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && searchRef.current) {
        event.preventDefault(); searchRef.current.focus();
      }
    };
    document.addEventListener('keydown', focusSearch);
    return () => document.removeEventListener('keydown', focusSearch);
  }, []);

  return <header className="workspace-topbar" role="banner" aria-label="Page header">
    <button type="button" className="workspace-menu-button" onClick={onOpenMenu} aria-label="Open menu"><Menu size={20} /></button>
    <div className="workspace-page-identity">
      <Building2 size={21} strokeWidth={1.5} aria-hidden="true" />
      <span className="workspace-residence-name">GEM Residences</span>
      <h1 className="sr-only">{workspacePageTitle(path)}</h1>
    </div>
    {config && <form className="workspace-search" role="search" onSubmit={(event) => {
      event.preventDefault(); const query = search.trim();
      if (query) { navigate(config.path + '?' + new URLSearchParams({ search: query })); setSearch(''); }
    }}><Search size={17} aria-hidden="true" /><input ref={searchRef} type="search" maxLength={120} aria-label={config.label} placeholder={config.placeholder} value={search} onChange={(event) => setSearch(event.target.value)} />
      {search && <button type="button" aria-label="Clear header search" onClick={() => { setSearch(''); searchRef.current?.focus(); }}><X size={14} /></button>}
      <button type="button" className="workspace-search-key" aria-label="Focus search" title="Focus search (Command+K or Ctrl+K)" onClick={() => searchRef.current?.focus()}><Command size={12} aria-hidden="true" />K</button>
    </form>}
    <button type="button" className="workspace-theme-toggle" role="switch" aria-label="Dark mode"
      aria-checked={theme === 'dark'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={onToggleTheme}>
      {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
    <button type="button" className="workspace-notifications" title="Notifications" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'} onClick={() => navigate('/notifications')}>
      <Bell size={19} />{unreadCount > 0 && <span className="workspace-notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
  </header>;
}
