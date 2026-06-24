import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LayoutDashboard, Sun,
  // Sales
  Briefcase, ClipboardSignature, UserPlus, TrendingUp, Trophy, BadgePercent,
  // Money
  Receipt, FileSpreadsheet, ReceiptText, Banknote, LineChart, Wallet, Coins,
  // Contracts
  FileText, FileX,
  // Fulfilment
  ClipboardList, ShieldCheck, PackagePlus, FilePlus2, Inbox as InboxIcon,
  // Team
  Users, IdCard, Target, BarChart3, Activity as ActivityIcon, BookOpen,
  // Marketing
  Megaphone, Mail, FileBarChart2, ImagePlus, ShoppingBag,
  // Activity
  History, UserCog, UsersRound, UserSquare, Headset, MapPin,
  // Comms
  MessagesSquare, MailOpen,
  // Calendar
  Calendar,
  // Settings
  Settings, FileBarChart, LogOut,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import Mascot from './Mascot.jsx';
import NotificationBell from './NotificationBell.jsx';

/** 50 surfaces, grouped 12 ways. Order matches the slice plan. */
const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/owner',                   label: 'Dashboard',           icon: LayoutDashboard, end: true },
      { to: '/owner/my-day',            label: 'My Day',              icon: Sun },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/owner/sales/log',         label: 'Log Sale',            icon: ClipboardSignature },
      { to: '/owner/sales/leads',       label: 'Leads',               icon: UserPlus },
      { to: '/owner/sales',             label: 'Sales Opportunities', icon: TrendingUp, end: true },
      { to: '/owner/sales/deals',       label: 'Deals',               icon: Briefcase },
      { to: '/owner/sales/upsell',      label: 'Upsell',              icon: BadgePercent },
      { to: '/owner/sales/my',          label: 'My Sales',            icon: Trophy },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/owner/invoices',          label: 'Invoices',            icon: Receipt },
      { to: '/owner/admin-invoices',    label: 'Admin Invoices',      icon: FileSpreadsheet },
      { to: '/owner/receipts',          label: 'Receipts',            icon: ReceiptText },
      { to: '/owner/debit-orders',      label: 'Debit Orders',        icon: Banknote },
      { to: '/owner/financials',        label: 'Owner Financials',    icon: LineChart },
      { to: '/owner/commissions',       label: 'Commissions',         icon: Coins },
      { to: '/owner/payroll',           label: 'Payroll',             icon: Wallet },
    ],
  },
  {
    label: 'Contracts',
    items: [
      { to: '/owner/contracts',         label: 'Contracts',           icon: FileText },
      { to: '/owner/contracts/cancelled', label: 'Cancelled Contracts', icon: FileX },
    ],
  },
  {
    label: 'Fulfilment',
    items: [
      { to: '/owner/deliverables',      label: 'Deliverables',        icon: ClipboardList },
      { to: '/owner/deliverable-quality', label: 'Deliverable Quality', icon: ShieldCheck },
      { to: '/owner/service-orders',    label: 'Service Orders',      icon: PackagePlus },
      { to: '/owner/onboarding-forms',  label: 'Onboarding Forms',    icon: FilePlus2 },
      { to: '/owner/onboarding-submissions', label: 'Onboarding Submissions', icon: InboxIcon },
    ],
  },
  {
    label: 'Team',
    items: [
      { to: '/owner/users',             label: 'Users',               icon: Users },
      { to: '/owner/staff-hr',          label: 'Staff HR',            icon: IdCard },
      { to: '/owner/kpi-targets',       label: 'KPI Targets',         icon: Target },
      { to: '/owner/team-performance',  label: 'Team Performance',    icon: BarChart3 },
      { to: '/owner/staff-productivity',label: 'Staff Productivity',  icon: ActivityIcon },
      { to: '/owner/playbooks',         label: 'Playbooks',           icon: BookOpen },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { to: '/owner/campaigns',         label: 'Campaigns',           icon: Megaphone },
      { to: '/owner/email-templates',   label: 'Email Templates',     icon: Mail },
      { to: '/owner/monthly-reports',   label: 'Monthly Reports',     icon: FileBarChart2 },
      { to: '/owner/image-generator',   label: 'Image Generator',     icon: ImagePlus },
      { to: '/owner/products',          label: 'Products',            icon: ShoppingBag },
    ],
  },
  {
    label: 'Activity',
    items: [
      { to: '/owner/activity',          label: 'All Activity',        icon: History },
      { to: '/owner/activity/admin',    label: 'Admin Activity',      icon: UserCog },
      { to: '/owner/activity/staff',    label: 'Staff Activity',      icon: UsersRound },
      { to: '/owner/activity/client',   label: 'Client Activity',     icon: UserSquare },
      { to: '/owner/activity/cpc',      label: 'CPC Activity',        icon: Headset },
      { to: '/owner/activity/field',    label: 'Field Activity',      icon: MapPin },
    ],
  },
  {
    label: 'Communication',
    items: [
      { to: '/owner/inbox',             label: 'Inbox',               icon: MessagesSquare },
      { to: '/owner/mail',              label: 'Mail',                icon: MailOpen },
    ],
  },
  {
    label: 'Calendar',
    items: [
      { to: '/owner/calendar',          label: 'Calendar',            icon: Calendar },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/owner/settings',          label: 'Settings',            icon: Settings },
      { to: '/owner/reports',           label: 'Owner Reports',       icon: FileBarChart },
    ],
  },
];

export function OwnerShell() {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      toast.error(`Sign-out warning: ${err?.message ?? err}`);
      // Continue anyway — local tokens are cleared even on warning.
    }
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-aurora">
      <div className="grid min-h-screen grid-cols-[260px_1fr]">
        <aside className="flex max-h-screen flex-col border-r border-darkbg-border bg-darkbg-800/80">
          {/* Brand */}
          <div className="flex items-center gap-3 px-4 py-5">
            <Mascot size={42} />
            <div>
              <p className="font-display text-lg leading-none">
                <span className="text-gradient">Marketing iO</span>
              </p>
              <p className="text-xs text-soft">Owner Console</p>
            </div>
          </div>

          {/* Scrollable nav — 50 surfaces in 12 groups */}
          <nav className="flex-1 overflow-y-auto px-3 pb-3">
            {NAV_GROUPS.map((g) => (
              <div key={g.label} className="mb-4">
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-soft">
                  {g.label}
                </p>
                <div className="space-y-0.5">
                  {g.items.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                      key={to} to={to} end={end}
                      className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
                    >
                      <Icon size={15}/>
                      <span className="truncate">{label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Profile chip pinned to the bottom */}
          <div className="m-3 rounded-xl border border-darkbg-border bg-darkbg-900/60 p-3">
            <p className="text-xs text-soft">Signed in as</p>
            <p className="truncate text-sm font-semibold">{profile?.full_name || profile?.email}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-brandred">
              {role ?? 'no role'}
            </p>
            <button onClick={handleSignOut} className="btn-ghost mt-3 w-full text-xs">
              <LogOut size={14}/> Sign out
            </button>
          </div>
        </aside>

        <main className="overflow-y-auto">
          <div className="sticky top-0 z-30 flex items-center justify-end gap-3 border-b border-darkbg-border/70 bg-darkbg-900/80 px-8 py-3 backdrop-blur">
            <NotificationBell />
          </div>
          <div className="px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
