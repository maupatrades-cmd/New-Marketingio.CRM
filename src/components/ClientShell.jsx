import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Home, FileSignature, Receipt, Package, User, LogOut, Menu, X,
  Bell, BarChart3, MessageSquare, Loader2,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

const LOGO_URL = 'https://yyrzppuntgtvurnnksfc.supabase.co/storage/v1/object/public/brand-assets/logo_email.png';

const MAIN_NAV = [
  { to: '/client',              label: 'Home',         icon: Home,         end: true },
  { to: '/client/contracts',    label: 'Contracts',    icon: FileSignature },
  { to: '/client/invoices',     label: 'Invoices',     icon: Receipt },
  { to: '/client/deliverables', label: 'Deliverables', icon: Package },
];

const MORE_NAV = [
  { to: '/client/reports',       label: 'Reports',       icon: BarChart3 },
  { to: '/client/messages',      label: 'Messages',      icon: MessageSquare },
  { to: '/client/notifications', label: 'Notifications', icon: Bell },
  { to: '/client/profile',       label: 'Profile',       icon: User },
];

export default function ClientShell() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  const handleSignOut = async () => {
    try { await signOut(); } catch (_) {}
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50 text-[#0B2143] flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-52 md:flex-col md:border-r md:border-gray-200 md:bg-white/80 md:backdrop-blur-xl">
        <div className="p-4 border-b border-gray-100">
          <img src={LOGO_URL} alt="Marketing iO" className="h-8 w-auto object-contain" />
          <p className="text-xs text-gray-400 mt-1">Client Portal</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {MAIN_NAV.concat(MORE_NAV).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
                     className={({ isActive }) =>
                       `flex items-center gap-2 rounded-r-xl px-3 py-2 text-sm transition border-l-2 ${
                         isActive
                           ? 'bg-red-50 text-red-600 border-red-500'
                           : 'text-gray-700 border-transparent hover:bg-gray-50 hover:text-[#0B2143]'
                       }`}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={handleSignOut}
                className="m-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition">
          <LogOut size={16} /> Sign out
        </button>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden border-b border-gray-200 bg-white/80 backdrop-blur-xl">
        <div className="px-4 py-3 flex items-center justify-between">
          <img src={LOGO_URL} alt="Marketing iO" className="h-7 w-auto object-contain" />
          <NotificationBell open={bellOpen} setOpen={setBellOpen} />
        </div>
      </header>

      {/* Main + desktop bell */}
      <div className="flex-1 flex flex-col">
        <div className="hidden md:flex items-center justify-end px-6 py-3 border-b border-gray-200 bg-white/60 backdrop-blur">
          <NotificationBell open={bellOpen} setOpen={setBellOpen} />
        </div>
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white">
        <div className="grid grid-cols-5">
          {MAIN_NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
                     className={({ isActive }) =>
                       `flex flex-col items-center gap-0.5 py-2 text-[10px] transition ${
                         isActive ? 'text-red-500' : 'text-gray-400'
                       }`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)}
                  className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-gray-400">
            <Menu size={18} /> More
          </button>
        </div>
      </nav>

      {/* Mobile "More" drawer */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setMoreOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white border-t border-gray-200 p-4 space-y-1 shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#0B2143]">More</span>
              <button onClick={() => setMoreOpen(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            {MORE_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={() => setMoreOpen(false)}
                       className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-[#0B2143] hover:bg-gray-50">
                <Icon size={16} className="text-gray-400" /> {label}
              </NavLink>
            ))}
            <button onClick={handleSignOut}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-red-600 hover:bg-red-50">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
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
    mutationFn: async (id) => {
      await supabase.rpc('mark_notification_read', { p_id: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-notifications'] }),
  });

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
              className="relative rounded-full p-2 hover:bg-gray-100 transition">
        <Bell size={18} className="text-gray-500" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 rounded-full bg-red-500 text-[10px] text-white px-1.5 py-0.5 min-w-[16px] text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-80 max-w-[90vw] z-50 rounded-2xl border border-gray-100 bg-white shadow-xl">
            <div className="flex items-center justify-between p-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-[#0B2143]">Notifications</span>
              <Link to="/client/notifications" onClick={() => setOpen(false)}
                    className="text-xs text-red-500 hover:text-red-600">See all</Link>
            </div>
            {bellQ.isLoading ? (
              <div className="p-6 text-center"><Loader2 size={16} className="animate-spin text-gray-400 mx-auto" /></div>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">No notifications yet.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {items.slice(0, 5).map(n => (
                  <li key={n.id}>
                    <Link to={n.action_url || '/client/notifications'}
                          onClick={() => { if (!n.is_read) readMut.mutate(n.id); setOpen(false); }}
                          className={`block px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition ${
                            !n.is_read ? 'bg-red-50/50' : ''
                          }`}>
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
