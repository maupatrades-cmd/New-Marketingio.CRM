import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, Briefcase, Receipt, FileText, ClipboardList,
  Megaphone, Wallet, Settings, LogOut, BookOpen,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { Mascot } from './Mascot.jsx';

const navItems = [
  { to: '/owner',             label: 'Dashboard',    icon: LayoutDashboard, end: true },
  { to: '/owner/sales',       label: 'Sales',        icon: Briefcase },
  { to: '/owner/clients',     label: 'Clients',      icon: Users },
  { to: '/owner/invoices',    label: 'Invoices',     icon: Receipt },
  { to: '/owner/contracts',   label: 'Contracts',    icon: FileText },
  { to: '/owner/deliverables',label: 'Deliverables', icon: ClipboardList },
  { to: '/owner/campaigns',   label: 'Campaigns',    icon: Megaphone },
  { to: '/owner/payroll',     label: 'Payroll',      icon: Wallet },
  { to: '/owner/playbooks',   label: 'Playbooks',    icon: BookOpen },
  { to: '/owner/settings',    label: 'Settings',     icon: Settings },
];

export function OwnerShell() {
  const { profile, role, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-aurora">
      <div className="grid min-h-screen grid-cols-[260px_1fr]">
        <aside className="border-r border-navy-border bg-navy-800/80 px-4 py-6">
          <div className="mb-6 flex items-center gap-3">
            <Mascot size={42} waving={false} />
            <div>
              <p className="font-display text-lg leading-none">
                <span className="text-gradient">Marketing iO</span>
              </p>
              <p className="text-xs text-soft">Owner Console</p>
            </div>
          </div>
          <nav className="space-y-1">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-8 rounded-xl border border-navy-border bg-navy-900/60 p-3">
            <p className="text-xs text-soft">Signed in as</p>
            <p className="truncate text-sm font-semibold">{profile?.full_name || profile?.email}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-brandred">{role ?? 'no role'}</p>
            <button onClick={signOut} className="btn-ghost mt-3 w-full text-xs">
              <LogOut size={14}/> Sign out
            </button>
          </div>
        </aside>
        <main className="px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
