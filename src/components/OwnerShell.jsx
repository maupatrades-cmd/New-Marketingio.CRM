import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, Briefcase, Receipt, FileText, ClipboardList,
  Megaphone, Wallet, Settings, LogOut, BookOpen,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { Mascot } from './Mascot.jsx';

const navItems = [
  { to: '/owner', label: 'Dashboard',  icon: LayoutDashboard, end: true },
  { to: '/owner/sales',       label: 'Sales',       icon: Briefcase },
  { to: '/owner/clients',     label: 'Clients',     icon: Users },
  { to: '/owner/invoices',    label: 'Invoices',    icon: Receipt },
  { to: '/owner/contracts',   label: 'Contracts',   icon: FileText },
  { to: '/owner/deliverables',label: 'Deliverables',icon: ClipboardList },
  { to: '/owner/campaigns',   label: 'Campaigns',   icon: Megaphone },
  { to: '/owner/payroll',     label: 'Payroll',     icon: Wallet },
  { to: '/owner/playbooks',   label: 'Playbooks',   icon: BookOpen },
  { to: '/owner/settings',    label: 'Settings',    icon: Settings },
];

export function OwnerShell() {
  const { profile, role, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-synth-bg bg-grid text-synth-text">
      <div className="grid min-h-screen grid-cols-[260px_1fr]">
        <aside className="border-r border-synth-line bg-synth-surface/40 px-4 py-6">
          <div className="mb-6 flex items-center gap-3">
            <Mascot size={42} waving={false} />
            <div>
              <p className="font-display text-lg leading-none">Marketing iO</p>
              <p className="text-xs text-synth-muted">Owner Console</p>
            </div>
          </div>
          <nav className="space-y-1">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                    isActive
                      ? 'bg-synth-primary/15 text-synth-primary glow-cyan'
                      : 'text-synth-text/80 hover:bg-synth-line/40'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-8 rounded-xl border border-synth-line bg-synth-bg/60 p-3">
            <p className="text-xs text-synth-muted">Signed in as</p>
            <p className="truncate text-sm font-semibold">{profile?.full_name || profile?.email}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-synth-accent">{role ?? 'no role'}</p>
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
