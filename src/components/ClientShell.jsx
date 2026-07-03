import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, FileSignature, Receipt, Package, User, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';

const NAV = [
  { to: '/client',              label: 'Home',         icon: Home,          end: true },
  { to: '/client/contracts',    label: 'Contracts',    icon: FileSignature },
  { to: '/client/invoices',     label: 'Invoices',     icon: Receipt },
  { to: '/client/deliverables', label: 'Deliverables', icon: Package },
  { to: '/client/profile',      label: 'Profile',      icon: User },
];

export default function ClientShell() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => {
    try { await signOut(); } catch (_) {}
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-darkbg-900 text-white flex flex-col">
      <header className="border-b border-darkbg-border bg-darkbg-800/60 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg text-gradient">Marketing iO</span>
            <span className="text-soft text-xs hidden sm:inline">| Client Portal</span>
          </div>
          <button onClick={handleSignOut}
                  className="inline-flex items-center gap-1 text-xs text-soft hover:text-white transition">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <nav className="mx-auto max-w-5xl px-2 flex gap-1 overflow-x-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
                     className={({ isActive }) =>
                       `inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition whitespace-nowrap ${
                         isActive
                           ? 'border-brandred text-white'
                           : 'border-transparent text-soft hover:text-white'
                       }`}>
              <Icon size={14} /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
