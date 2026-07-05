import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Home, FileSignature, Receipt, Package, User, LogOut, Menu, X,
  Bell, BarChart3, MessageSquare, Loader2, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase.js';

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
    <div className="min-h-screen bg-darkbg-900 text-white flex flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-52 md:flex-col md:border-r md:border-darkbg-border md:bg-darkbg-800/60">
        <div className="p-4 border-b border-darkbg-border">
          <p className="font-display text-lg text-gradient">Marketing iO</p>
          <p className="text-xs text-soft">Client Portal</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {MAIN_NAV.concat(MORE_NAV).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
                     className={({ isActive }) =>
                       `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                         isActive ? 'bg-brandred/20 text-white' : 'text-soft hover:text-white hover:bg-darkbg-700/50'
                       }`}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={handleSignOut}
                className="m-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-soft hover:text-white hover:bg-darkbg-700/50 transition">
          <LogOut size={16} /> Sign out
        </button>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden border-b border-darkbg-border bg-darkbg-800/60 backdrop-blur">
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="font-display text-lg text-gradient">Marketing iO</span>
          <NotificationBell open={bellOpen} setOpen={setBellOpen} />
        </div>
      </header>

      {/* Main + desktop bell */}
      <div className="flex-1 flex flex-col">
        <div className="hidden md:flex items-center justify-end px-6 py-3 border-b border-darkbg-border bg-darkbg-800/40">
          <NotificationBell open={bellOpen} setOpen={setBellOpen} />
        </div>
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 pb-24 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-darkbg-border bg-darkbg-800/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {MAIN_NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
                     className={({ isActive }) =>
                       `flex flex-col items-center gap-0.5 py-2 text-[10px] transition ${
                         isActive ? 'text-brandred' : 'text-soft'
                       }`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)}
                  className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-soft">
            <Menu size={18} /> More
          </button>
        </div>
      </nav>

      {/* Mobile "More" drawer */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMoreOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-darkbg-800 border-t border-darkbg-border p-4 space-y-1"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">More</span>
              <button onClick={() => setMoreOpen(false)}><X size={18} className="text-soft" /></button>
            </div>
            {MORE_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={() => setMoreOpen(false)}
                       className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-white hover:bg-darkbg-700/50">
                <Icon size={16} className="text-soft" /> {label}
              </NavLink>
            ))}
            <button onClick={handleSignOut}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-rose-300 hover:bg-rose-500/10">
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
              className="relative rounded-full p-2 hover:bg-darkbg-700/60 transition">
        <Bell size={18} className="text-soft" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 rounded-full bg-brandred text-[10px] text-white px-1.5 py-0.5 min-w-[16px] text-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-80 max-w-[90vw] z-50 rounded-xl border border-darkbg-border bg-darkbg-800 shadow-xl">
            <div className="flex items-center justify-between p-3 border-b border-darkbg-border">
              <span className="text-sm font-semibold text-white">Notifications</span>
              <Link to="/client/notifications" onClick={() => setOpen(false)}
                    className="text-xs text-brandred hover:text-brandred/80">See all</Link>
            </div>
            {bellQ.isLoading ? (
              <div className="p-6 text-center"><Loader2 size={16} className="animate-spin text-soft mx-auto" /></div>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-sm text-soft">No notifications yet.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {items.slice(0, 5).map(n => (
                  <li key={n.id}>
                    <Link to={n.action_url || '/client/notifications'}
                          onClick={() => { if (!n.is_read) readMut.mutate(n.id); setOpen(false); }}
                          className={`block px-3 py-2.5 border-b border-darkbg-border/50 hover:bg-darkbg-700/50 transition ${
                            !n.is_read ? 'bg-brandred/5' : ''
                          }`}>
                      <div className="flex items-start gap-2">
                        {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brandred shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{n.title}</p>
                          {n.body && <p className="text-[11px] text-soft mt-0.5 line-clamp-2">{n.body}</p>}
                          <p className="text-[10px] text-soft mt-1">{new Date(n.created_at).toLocaleString('en-ZA')}</p>
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
