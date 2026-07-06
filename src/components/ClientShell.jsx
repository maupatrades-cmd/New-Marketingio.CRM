import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, ShoppingCart, Receipt, FileSignature, MessageCircle, Activity,
  Package, Upload, ShoppingBag, CreditCard, Settings, User, LogOut, Menu, X, Bell, Zap,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';
import MascotGuide from './MascotGuide.jsx';
import { useGlowPointer } from './ui/GlowCard.jsx';

const LOGO_URL = 'https://yyrzppuntgtvurnnksfc.supabase.co/storage/v1/object/public/brand-assets/logo_email.png';

const MAIN_NAV = [
  { to: '/client',              label: 'Dashboard',           icon: LayoutDashboard, end: true },
  { to: '/client/spark',        label: 'Spark',               icon: Zap },
  { to: '/client/products',     label: 'Products & Services', icon: ShoppingCart },
  { to: '/client/invoices',     label: 'Invoices',            icon: Receipt,        badgeKey: 'unpaid_invoices' },
  { to: '/client/contracts',    label: 'Contracts',           icon: FileSignature },
  { to: '/client/messages',     label: 'Messages',            icon: MessageCircle,  badgeKey: 'unread_messages' },
  { to: '/client/activity',     label: 'Activity',            icon: Activity,       badgeKey: 'unread_activity' },
  { to: '/client/deliverables', label: 'Deliverables',        icon: Package },
];
const BOTTOM_NAV = [
  { to: '/client/uploads',      label: 'Uploads',      icon: Upload },
  { to: '/client/orders',       label: 'Orders',       icon: ShoppingBag },
  { to: '/client/subscription', label: 'Subscription', icon: CreditCard },
  { to: '/client/settings',     label: 'Settings',     icon: Settings },
];
// Mobile bottom tab bar — 4 primary + More
const MOBILE_TABS = [
  { to: '/client',              label: 'Home',    icon: LayoutDashboard, end: true },
  { to: '/client/invoices',     label: 'Invoices', icon: Receipt },
  { to: '/client/deliverables', label: 'Work',    icon: Package },
  { to: '/client/messages',     label: 'Messages', icon: MessageCircle },
];

const LIFECYCLE = {
  lead:        { label: 'Lead',       cls: 'bg-gray-100 text-gray-600 ring-gray-200' },
  onboarding:  { label: 'Onboarding', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  active:      { label: 'Active',     cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  suspended:   { label: 'Suspended',  cls: 'bg-red-50 text-red-700 ring-red-200' },
};

export default function ClientShell() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  useGlowPointer();

  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_dashboard');
      if (error) throw error;
      return data;
    },
  });
  const dash = dashQ.data ?? {};
  const client = dash.client ?? {};
  const clientId = client.id;
  const lifecycle = LIFECYCLE[client.status] ?? null;

  // Realtime — invalidate queries as the client's data changes server-side.
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase.channel('client-portal-' + clientId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables', filter: `client_id=eq.${clientId}` },
        () => { qc.invalidateQueries({ queryKey: ['client-dashboard'] }); qc.invalidateQueries({ queryKey: ['my-deliverables'] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `client_id=eq.${clientId}` },
        () => { qc.invalidateQueries({ queryKey: ['client-dashboard'] }); qc.invalidateQueries({ queryKey: ['my-invoices'] }); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'client_notifications', filter: `client_id=eq.${clientId}` },
        () => { qc.invalidateQueries({ queryKey: ['client-dashboard'] }); qc.invalidateQueries({ queryKey: ['my-notifications'] }); qc.invalidateQueries({ queryKey: ['my-activity'] }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, qc]);

  const handleSignOut = async () => {
    try { await signOut(); } catch (_) {}
    navigate('/login', { replace: true });
  };

  const badge = (key) => {
    const n = key ? dash[key] : 0;
    if (!n) return null;
    return <span className="ml-auto bg-[#E2293B] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{n > 9 ? '9+' : n}</span>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50 text-[#0B2143] flex flex-col md:flex-row relative">

      {/* Desktop sidebar — navy blue gradient */}
      <aside className="hidden md:flex md:w-[220px] md:flex-col md:border-r md:border-white/10 relative z-20"
             style={{ background: 'linear-gradient(180deg, #0B2143 0%, #061638 100%)' }}>
        <div className="p-4 border-b border-white/10">
          <img src={LOGO_URL} alt="Marketing iO" className="h-9 w-auto object-contain" />
          <p className="text-sm font-bold text-white mt-3 truncate">{client.business_name || client.contact_person || 'Your account'}</p>
          <span className="inline-block mt-1 rounded-full bg-white/10 text-white/80 px-2.5 py-0.5 text-[10px] font-semibold">
            {dash.onboarding?.overall_status === 'complete' || client.status === 'active' ? 'Active' : 'Onboarding'}
          </span>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {MAIN_NAV.map(({ to, label, icon: Icon, end, badgeKey }) => (
            <NavLink key={to} to={to} end={end}
                     className={({ isActive }) => `nav-luxe ${isActive ? 'nav-luxe-active-red-pill' : 'nav-luxe-idle-on-blue'}`}>
              <Icon size={18} /> <span>{label}</span> {badge(badgeKey)}
            </NavLink>
          ))}
          <div className="my-2 border-t border-white/10" />
          {BOTTOM_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
                     className={({ isActive }) => `nav-luxe ${isActive ? 'nav-luxe-active-red-pill' : 'nav-luxe-idle-on-blue'}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={handleSignOut} className="m-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-red-500/25 transition">
          <LogOut size={16} /> Sign out
        </button>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden border-b border-slate-200 bg-white">
        <div className="px-4 py-3 flex items-center justify-between">
          <img src={LOGO_URL} alt="Marketing iO" className="h-7 w-auto object-contain" />
          <NotificationBell open={bellOpen} setOpen={setBellOpen} />
        </div>
      </header>

      <div className="flex-1 flex flex-col relative z-10">
        <TopBar client={client} bellOpen={bellOpen} setBellOpen={setBellOpen} />
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white">
        <div className="grid grid-cols-5">
          {MOBILE_TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
                     className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10px] transition ${isActive ? 'text-red-500' : 'text-gray-400'}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-gray-400">
            <Menu size={18} /> More
          </button>
        </div>
      </nav>

      {/* Mobile "More" drawer */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setMoreOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white border-t border-gray-200 p-4 space-y-1 shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#0B2143]">More</span>
              <button onClick={() => setMoreOpen(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            {[...MAIN_NAV.filter(n => !MOBILE_TABS.some(m => m.to === n.to)), ...BOTTOM_NAV,
              { to: '/client/reports', label: 'Reports', icon: Activity },
              { to: '/client/profile', label: 'Profile', icon: User }].map(({ to, label, icon: Icon, badgeKey }) => (
              <NavLink key={to} to={to} onClick={() => setMoreOpen(false)}
                       className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-[#0B2143] hover:bg-gray-50">
                <Icon size={16} className="text-gray-400" /> <span>{label}</span> {badge(badgeKey)}
              </NavLink>
            ))}
            <button onClick={handleSignOut} className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-red-600 hover:bg-red-50">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function TopBar({ client, bellOpen, setBellOpen }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const dateStr = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const timeStr = `${hours}:${String(minutes).padStart(2, '0')} ${ampm} SAST`;

  return (
    <div className="hidden md:flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
      <p className="text-lg font-bold text-[#0B2143] tracking-wide truncate max-w-[40%]">
        {client.business_name || client.contact_person || ''}
      </p>
      <div className="flex items-center gap-6">
        <div className="flex items-baseline gap-5">
          <p className="text-sm font-semibold text-[#0B2143] tabular-nums">{dateStr}</p>
          <p className="text-sm font-semibold text-[#0B2143] tabular-nums">{timeStr}</p>
        </div>
        <NotificationBell open={bellOpen} setOpen={setBellOpen} />
      </div>
    </div>
  );
}

function NotificationBell({ open, setOpen }) {
  const qc = useQueryClient();
  const bellQ = useQuery({
    queryKey: ['my-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_notifications', { p_limit: 10 });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });
  const items = bellQ.data ?? [];
  const unread = items.filter(n => !n.is_read).length;
  const readMut = useMutation({
    mutationFn: async (id) => { await supabase.rpc('mark_notification_read', { p_id: id }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
  });

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-full p-2 hover:bg-gray-100 transition">
        <Bell size={18} className="text-gray-500" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 rounded-full bg-red-500 text-[10px] text-white px-1.5 py-0.5 min-w-[16px] text-center">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-80 max-w-[90vw] z-50 rounded-2xl border border-gray-100 bg-white shadow-xl">
            <div className="flex items-center justify-between p-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-[#0B2143]">Notifications</span>
              <Link to="/client/activity" onClick={() => setOpen(false)} className="text-xs text-red-500 hover:text-red-600">See all</Link>
            </div>
            {bellQ.isLoading ? (
              <div className="flex flex-col items-center justify-center py-6">
                <MascotGuide phase="thinking" size={64} message="Fetching notifications..." position="inline" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-6">
                <MascotGuide phase="guide" size={64} message="No notifications yet." position="inline" />
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {items.slice(0, 5).map(n => (
                  <li key={n.id}>
                    <Link to={n.action_url || '/client/activity'} onClick={() => { if (!n.is_read) readMut.mutate(n.id); setOpen(false); }}
                          className={`block px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition ${!n.is_read ? 'bg-red-50/50' : ''}`}>
                      <div className="flex items-start gap-2">
                        {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#0B2143] truncate">{n.title}</p>
                          {n.body && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                          <p className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString('en-ZA')}</p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
