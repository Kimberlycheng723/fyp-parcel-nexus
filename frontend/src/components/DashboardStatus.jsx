import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { dashboardGreeting } from '../utils/adminDashboard.js';

const GREETING_EMOJI = {
  'Good morning': '\u2600\ufe0f',
  'Good afternoon': '\ud83c\udf24\ufe0f',
  'Good evening': '\ud83c\udf19'
};

export function DashboardGreeting() {
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const name = user?.first_name?.trim();
  const greeting = dashboardGreeting(now);
  return <div className="dashboard-welcome-row"><h2 className="dashboard-greeting"><span aria-hidden="true">{GREETING_EMOJI[greeting]}</span>{' '}{greeting}{name ? ', ' + name : ''}.</h2><MalaysiaClock /></div>;
}

export function MalaysiaClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const label = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(now);
  return <time className="dashboard-malaysia-clock" dateTime={now.toISOString()} title="Malaysia time">{label}</time>;
}

export function OverdueCaution({ count }) {
  const total = Number(count) || 0;
  if (total <= 0) return null;
  return <div className="dashboard-overdue-caution" role="note"><AlertTriangle size={18} aria-hidden="true" /><span><strong>Attention:</strong> {total.toLocaleString('en-MY')} {total === 1 ? 'parcel has' : 'parcels have'} been overdue for more than 60 days.</span></div>;
}
