const PAGE_TITLES = {
  '/dashboard': 'Dashboard', '/analytics': 'Analytics and Reporting', '/parcels': 'Parcels',
  '/parcels/new': 'Log New Parcel', '/parcel-rooms': 'Parcel Rooms', '/parcel-trace': 'Parcel Trace',
  '/accounts': 'Accounts', '/audit-logs': 'Audit Trail', '/profile': 'Profile', '/notifications': 'Notifications',
  '/chatbot': 'AI Chatbot', '/disputes': 'Disputes', '/disputes/new': 'Raise a Dispute',
  '/verify-collection': 'Collection Verification', '/parcel-collection': 'Parcel Collection'
};

export function workspacePageTitle(path) {
  return PAGE_TITLES[path] || (/^\/disputes\/[0-9a-f-]{36}$/i.test(path) ? 'Dispute Details' : 'Dashboard');
}

export function workspaceSearchConfig(role) {
  if (role === 'RESIDENT') return { path: '/dashboard', placeholder: 'Search your parcels', label: 'Search your parcels' };
  if (role === 'SUPER_ADMIN') return { path: '/accounts', placeholder: 'Search accounts', label: 'Search accounts' };
  if (['ADMIN', 'GUARD'].includes(role)) return { path: '/parcels', placeholder: 'Search parcels, couriers, units', label: 'Search parcels' };
  return null;
}
