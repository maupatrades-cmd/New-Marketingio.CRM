import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Sun, UserPlus, MapPin, Inbox as InboxIcon, List, GitPullRequest,
  TrendingUp, BadgePercent, Trophy, Receipt, XCircle, Coins, DollarSign,
  Users, BarChart3, Zap, CheckSquare, MessageSquare, Bell,
  Phone, Footprints, BookOpen, ShoppingBag, User,
  ShieldCheck, LayoutDashboard, FileBarChart2, Lock, UsersRound,
  Settings, ArrowLeft, LogOut, ClipboardSignature,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import Mascot from './Mascot.jsx';
import NotificationBell from './NotificationBell.jsx';

// ─── Role sets ───────────────────────────────────────────────────────────────
const ALL     = ['owner', 'admin', 'head_of_tech', 'field_agent', 'cpc'];
const LEAD    = ['owner', 'admin', 'head_of_tech'];
const FA_CPC  = ['owner', 'admin', 'head_of_tech', 'field_agent', 'cpc'];
const NON_OWN = ['admin', 'head_of_tech', 'field_agent', 'cpc'];
const OWN     = ['owner'];

/**
 * NAV_SECTIONS — sectioned sidebar, single source of truth.
 * header: null → no label shown (Dashboard section).
 * management: true → section only renders when user has LEAD or OWN role.
 */
const NAV_SECTIONS = [
  {
    header: null,
    items: [
      { to: '/owner/my-day', label: 'My Day', icon: Sun, roles: ALL, end: true },
    ],
  },
  {
    header: 'Leads',
    items: [
      { to: '/owner/leads/new',   label: 'New Lead',    icon: UserPlus,  roles: ALL },
      { to: '/owner/leads/my',    label: 'My Leads',    icon: MapPin,    roles: ALL },
      { to: '/owner/leads/inbox', label: 'Leads Inbox', icon: InboxIcon, roles: ALL },
      { to: '/owner/leads',       label: 'All Leads',   icon: List,      roles: LEAD },
    ],
  },
  {
    header: 'Sales',
    items: [
      { to: '/owner/sales/leads',         label: 'Pipeline',            icon: GitPullRequest,     roles: ALL },
      { to: '/owner/sales/log',           label: 'Log Sale',            icon: ClipboardSignature, roles: FA_CPC },
      { to: '/owner/sales/opportunities', label: 'Sales Opportunities', icon: TrendingUp,         roles: ALL },
      { to: '/owner/sales/upsell',        label: 'Upsell',              icon: BadgePercent,       roles: ALL },
      { to: '/owner/sales/my-sales',      label: 'My Sales',            icon: Trophy,             roles: ALL },
    ],
  },
  {
    header: 'Clients',
    items: [
      { to: '/owner/clients', label: 'My Clients', icon: Users,       roles: ALL },
      { to: '/owner/tasks',   label: 'Tasks',       icon: CheckSquare, roles: ALL },
    ],
  },
  {
    header: 'Money',
    items: [
      { to: '/owner/money/invoices',           label: 'My Invoices',        icon: Receipt,    roles: ALL },
      { to: '/owner/money/invoices/cancelled', label: 'Cancelled Invoices', icon: XCircle,    roles: ALL },
      { to: '/owner/money/commissions',        label: 'My Commissions',     icon: Coins,      roles: ALL },
      { to: '/owner/money/earnings',           label: 'My Earnings',        icon: DollarSign, roles: NON_OWN },
    ],
  },
  {
    header: 'Activity',
    items: [
      { to: '/owner/activity/dials',   label: 'Dial Log',       icon: Phone,          roles: ['owner', 'admin', 'head_of_tech', 'cpc'] },
      { to: '/owner/activity/visits',  label: 'Visit Log',      icon: Footprints,     roles: ['owner', 'admin', 'head_of_tech', 'field_agent'] },
      { to: '/owner/comms/messages',   label: 'Communications', icon: MessageSquare,  roles: ALL },
      { to: '/owner/comms/notifications', label: 'Notifications', icon: Bell,          roles: ALL },
    ],
  },
  {
    header: 'Performance',
    items: [
      { to: '/owner/sales/kpis',      label: 'My KPIs',   icon: BarChart3, roles: ALL },
      { to: '/owner/sales/my-engine', label: 'My Engine', icon: Zap,       roles: ALL },
    ],
  },
  {
    header: 'Knowledge',
    items: [
      { to: '/owner/playbooks',         label: 'Playbooks',       icon: BookOpen,   roles: ALL },
      { to: '/owner/settings/catalogue',label: 'Add-on Catalogue',icon: ShoppingBag,roles: ALL },
    ],
  },
  {
    header: 'Me',
    items: [
      { to: '/owner/profile', label: 'Profile', icon: User, roles: ALL },
    ],
  },
  {
    header: 'Management',
    management: true,
    items: [
      { to: '/owner/approvals',              label: 'Approvals',       icon: CheckSquare,    roles: OWN },
      { to: '/owner/sales/conversion',       label: 'Conversion',      icon: LayoutDashboard,roles: LEAD },
      { to: '/owner/reports/monthly',        label: 'Monthly Reports', icon: FileBarChart2,  roles: LEAD },
      { to: '/owner/security/audit',         label: 'Audit Log',       icon: Lock,           roles: LEAD },
      { to: '/owner/security/banking-audit', label: 'Banking Audit',   icon: ShieldCheck,    roles: LEAD },
      { to: '/owner/team',                   label: 'Team',            icon: UsersRound,     roles: OWN },
      { to: '/owner/settings',               label: 'Settings',        icon: Settings,       roles: OWN },
    ],
  },
];

// Roots where Back has no sensible target
const NAV_ROOTS = ['/owner', '/owner/my-day', '/owner/leads/my', '/owner/sales/my-sales'];

export function OwnerShell() {
  const { profile, role, signOut } = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();
  const queryClient = useQueryClient();

  const showBack = !NAV_ROOTS.includes(location.pathname);

  function handleBack() {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/owner/my-day');
  }

  async function handleSignOut() {
    try { await signOut(); } catch (err) {
      toast.error(`Sign-out warning: ${err?.message ?? err}`);
    }
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  // No-role guard (spec §6, edge case 1)
  if (!role) {
    return (
      <div className="grid min-h-screen place-items-center bg-aurora px-4">
        <div className="card max-w-md p-8 text-center">
          <Mascot size={52} className="mx-auto mb-4" />
          <h1 className="font-display text-xl mb-2">
            <span className="text-gradient">No role assigned</span>
          </h1>
          <p className="text-soft text-sm mb-6">
            Your account doesn't have a role yet. Please contact the owner to get access assigned.
          </p>
          <button onClick={handleSignOut} className="btn-ghost text-xs">
            <LogOut size={14}/> Sign out
          </button>
        </div>
      </div>
    );
  }

  const visibleSections = NAV_SECTIONS
    .map(section => ({
      ...section,
      items: section.items.filter(item => item.roles.includes(role)),
    }))
    .filter(section => section.items.length > 0);

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
              <p className="text-xs text-soft">Staff Console</p>
            </div>
          </div>

          {/* Scrollable nav */}
          <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            {visibleSections.map((section, si) => (
              <div key={si}>
                {section.header && (
                  <div className={`${si > 0 ? 'mt-4' : 'mt-1'} mb-1 px-2 flex items-center gap-2`}>
                    {section.management && <div className="h-px flex-1 bg-darkbg-border/50" />}
                    <span className={`text-[9px] font-bold uppercase tracking-widest ${section.management ? 'text-brandred/70' : 'text-soft/50'}`}>
                      {section.header}
                    </span>
                    {section.management && <div className="h-px flex-1 bg-darkbg-border/50" />}
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.items.map(({ to, label, icon: Icon, end }) => (
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

          {/* Profile chip */}
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
          <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-darkbg-border/70 bg-darkbg-900/80 px-8 py-3 backdrop-blur">
            <div>
              {showBack && (
                <button onClick={handleBack}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-darkbg-border bg-darkbg-800/60 px-3 py-1.5 text-xs font-semibold text-soft transition hover:border-brandred hover:text-white">
                  <ArrowLeft size={14}/> Back
                </button>
              )}
            </div>
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
