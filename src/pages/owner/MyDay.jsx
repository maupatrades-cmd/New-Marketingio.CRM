import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus, GitPullRequest, FileBarChart2, CheckSquare,
  Phone, MapPin, MessageSquare, Zap, Users, Lock,
  TrendingUp, AlertTriangle, DollarSign, Activity,
  Clock, Target, Award, Flame, Bell, Snowflake, Trophy,
  Coins, CheckCircle, X, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import Mascot from '../../components/Mascot.jsx';

// ─── Motivational quotes (fallback until system_settings.motivational_quotes.v1 ships) ──
const QUOTES = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Small daily improvements are the key to staggering long-term results.', author: 'Robin Sharma' },
  { text: 'You don\'t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
  { text: 'The difference between ordinary and extraordinary is that little extra.', author: 'Jimmy Johnson' },
  { text: 'Don\'t watch the clock; do what it does. Keep going.', author: 'Sam Levenson' },
  { text: 'Motivation is what gets you started. Habit is what keeps you going.', author: 'Jim Ryun' },
  { text: 'Your limitation — it\'s only your imagination.', author: 'Unknown' },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—';
  return `R${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
}

function firstName(fullName) {
  return fullName?.split(' ')[0] || 'there';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ─── Reusable UI atoms ───────────────────────────────────────────────────────

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-darkbg-border bg-darkbg-800/60 p-5 ${className}`}>
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, label, color = 'text-soft' }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon size={15} className={color} />
      <span className="text-xs font-semibold uppercase tracking-widest text-soft">{label}</span>
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className="py-1">
      <p className="text-xs text-soft">{label}</p>
      <p className={`text-lg font-bold leading-tight ${accent || 'text-white'}`}>{value}</p>
      {sub && <p className="text-[11px] text-soft">{sub}</p>}
    </div>
  );
}

function StatRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between border-b border-darkbg-border/40 py-1.5 last:border-0">
      <span className="text-xs text-soft">{label}</span>
      <span className={`text-sm font-semibold ${accent || 'text-white'}`}>{value}</span>
    </div>
  );
}

function QuickBtn({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-darkbg-border bg-darkbg-900/60 px-3 py-2 text-xs font-semibold text-soft transition hover:border-brandred hover:text-white"
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function Loading() {
  return <div className="h-24 animate-pulse rounded-xl bg-darkbg-700/40" />;
}

function DialRing({ value, max, color }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = 28, cx = 36, cy = 36;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const ringColor = pct >= 1 ? '#22c55e' : pct >= 0.6 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={72} height={72} viewBox="0 0 72 72">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a3a" strokeWidth={7} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color || ringColor} strokeWidth={7}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#fff">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

// ─── From Others Feed ────────────────────────────────────────────────────────

// Which types require action (shown in red section)
const NEEDS_ACTION_TYPES = new Set([
  'cold_lead', 'setup_fee_cleared', 'lead_pending_verification',
  'sale_closed_won', 'hot_lead',
]);
// Which types go in messages section
const MESSAGE_TYPES = new Set(['message_received']);

const TYPE_META = {
  cold_lead:              { icon: Snowflake,    color: 'text-blue-400',   dot: 'bg-blue-500' },
  sale_closed_won:        { icon: Trophy,       color: 'text-orange-400', dot: 'bg-orange-500' },
  commission_unlocked:    { icon: DollarSign,   color: 'text-green-400',  dot: 'bg-green-500' },
  cpc_lead_fee_earned:    { icon: Coins,        color: 'text-green-400',  dot: 'bg-green-500' },
  cpc_closure_bonus_earned:{ icon: Award,       color: 'text-yellow-400', dot: 'bg-yellow-500' },
  sale_logged:            { icon: CheckCircle,  color: 'text-green-400',  dot: 'bg-green-500' },
  hot_lead:               { icon: Flame,        color: 'text-red-400',    dot: 'bg-red-500' },
  lead_assigned:          { icon: UserPlus,     color: 'text-blue-400',   dot: 'bg-blue-500' },
  setup_fee_cleared:      { icon: DollarSign,   color: 'text-green-400',  dot: 'bg-green-500' },
  message_received:       { icon: MessageSquare,color: 'text-purple-400', dot: 'bg-purple-500' },
};
const DEFAULT_META = { icon: Bell, color: 'text-soft', dot: 'bg-darkbg-border' };

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function FeedItem({ notif, onDismiss, onAction }) {
  const meta = TYPE_META[notif.notification_type] || DEFAULT_META;
  const Icon = meta.icon;
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition
      ${notif.is_read ? 'border-darkbg-border/30 bg-darkbg-900/20' : 'border-darkbg-border bg-darkbg-800/60'}`}>
      <div className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-darkbg-700 ${meta.color}`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${notif.is_read ? 'text-soft' : 'font-semibold text-white'}`}>
          {notif.title}
        </p>
        {notif.body && <p className="mt-0.5 text-xs text-soft">{notif.body}</p>}
        <p className="mt-1 text-[10px] uppercase tracking-widest text-soft/60">{timeAgo(notif.created_at)}</p>
      </div>
      <div className="flex flex-none items-center gap-1">
        {notif.action_url && (
          <button
            onClick={() => onAction(notif)}
            className="inline-flex items-center gap-1 rounded-md border border-darkbg-border bg-darkbg-700/60 px-2 py-1 text-[11px] font-semibold text-soft transition hover:border-brandred hover:text-white"
          >
            Open <ChevronRight size={11} />
          </button>
        )}
        <button
          onClick={() => onDismiss(notif.id)}
          className="rounded-md p-1 text-soft/50 transition hover:text-soft"
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function FeedSection({ title, color, items, onDismiss, onAction }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`mb-2 text-[10px] font-semibold uppercase tracking-widest ${color}`}>{title}</p>
      <div className="space-y-1.5">
        {items.map(n => (
          <FeedItem key={n.id} notif={n} onDismiss={onDismiss} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

function FromOthersFeed() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc  = useQueryClient();

  const { data: notifs = [], isLoading } = useQuery({
    queryKey: ['my-day-feed', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('client_notifications')
        .select('id, notification_type, title, body, action_url, is_read, created_at')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(40);
      return data || [];
    },
    staleTime: 30_000,
  });

  async function dismiss(id) {
    await supabase.rpc('mark_my_notifications_read', { p_ids: [id] });
    qc.invalidateQueries({ queryKey: ['my-day-feed', user?.id] });
    qc.invalidateQueries({ queryKey: ['notifications', user?.id] });
  }

  async function dismissAll() {
    await supabase.rpc('mark_my_notifications_read');
    qc.invalidateQueries({ queryKey: ['my-day-feed', user?.id] });
    qc.invalidateQueries({ queryKey: ['notifications', user?.id] });
  }

  function openAction(notif) {
    dismiss(notif.id);
    if (notif.action_url) nav(notif.action_url);
  }

  const needsAction = notifs.filter(n => NEEDS_ACTION_TYPES.has(n.notification_type) && !n.is_read);
  const recent      = notifs.filter(n => !NEEDS_ACTION_TYPES.has(n.notification_type) && !MESSAGE_TYPES.has(n.notification_type) && !n.is_read);
  const messages    = notifs.filter(n => MESSAGE_TYPES.has(n.notification_type) && !n.is_read);
  const read        = notifs.filter(n => n.is_read).slice(0, 5);

  const unread = needsAction.length + recent.length + messages.length;

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">
          <span className="text-gradient">From Others</span>
          {unread > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brandred px-1.5 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </h2>
        {unread > 0 && (
          <button onClick={dismissAll} className="text-xs text-soft hover:text-white transition">
            Mark all read
          </button>
        )}
      </div>

      {unread === 0 && read.length === 0 && (
        <div className="rounded-xl border border-darkbg-border/30 bg-darkbg-800/20 px-6 py-8 text-center">
          <p className="text-sm text-soft">You're all caught up. 🎉</p>
          <p className="mt-1 text-xs text-soft/60">New events from team and system will appear here.</p>
        </div>
      )}

      <FeedSection
        title="🔴 Needs Your Action"
        color="text-red-400"
        items={needsAction}
        onDismiss={dismiss}
        onAction={openAction}
      />
      <FeedSection
        title="📰 Recent Events"
        color="text-blue-400"
        items={recent}
        onDismiss={dismiss}
        onAction={openAction}
      />
      <FeedSection
        title="💬 Messages"
        color="text-purple-400"
        items={messages}
        onDismiss={dismiss}
        onAction={openAction}
      />

      {read.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-widest text-soft/50 hover:text-soft">
            Recently dismissed ({read.length})
          </summary>
          <div className="mt-2 space-y-1.5">
            {read.map(n => (
              <FeedItem key={n.id} notif={n} onDismiss={() => {}} onAction={openAction} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ─── OWNER ────────────────────────────────────────────────────────────────────

function OwnerDay({ profile }) {
  const nav = useNavigate();

  const { data: ar, isLoading: arLoading } = useQuery({
    queryKey: ['my-day-owner-ar'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('total_amount, status')
        .in('status', ['sent', 'overdue']);
      return data || [];
    },
  });

  const { data: revenue } = useQuery({
    queryKey: ['my-day-owner-revenue'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('status', 'paid')
        .gte('issue_date', monthStart());
      return data || [];
    },
  });

  const { data: commLiability } = useQuery({
    queryKey: ['my-day-owner-commissions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('commissions')
        .select('commission_amount')
        .eq('status', 'pending');
      return data || [];
    },
  });

  const { data: teamToday } = useQuery({
    queryKey: ['my-day-owner-team'],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_activity_log')
        .select('actor_id, actor_role, event_type, client_name, created_at')
        .gte('created_at', `${todayISO()}T00:00:00`)
        .order('created_at', { ascending: false })
        .limit(30);
      return data || [];
    },
  });

  const { data: hotDeals } = useQuery({
    queryKey: ['my-day-owner-hot'],
    queryFn: async () => {
      const { data } = await supabase
        .from('deals')
        .select('id, client_name, stage, setup_fee, monthly_retainer, updated_at')
        .in('stage', ['proposal_sent', 'negotiation'])
        .order('updated_at', { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const { data: coldDeals } = useQuery({
    queryKey: ['my-day-owner-cold'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 14 * 86400_000).toISOString();
      const { data } = await supabase
        .from('deals')
        .select('id, client_name, stage, updated_at')
        .in('stage', ['new_lead', 'discovery_visit'])
        .lt('updated_at', cutoff)
        .order('updated_at', { ascending: true })
        .limit(5);
      return data || [];
    },
  });

  const arTotal = useMemo(() => ar?.reduce((s, r) => s + Number(r.total_amount || 0), 0) || 0, [ar]);
  const revenueTotal = useMemo(() => revenue?.reduce((s, r) => s + Number(r.total_amount || 0), 0) || 0, [revenue]);
  const commTotal = useMemo(() => commLiability?.reduce((s, r) => s + Number(r.commission_amount || 0), 0) || 0, [commLiability]);

  const uniqueActors = useMemo(() => {
    const map = {};
    teamToday?.forEach(e => {
      if (!map[e.actor_id]) map[e.actor_id] = { role: e.actor_role, count: 0 };
      map[e.actor_id].count++;
    });
    return Object.entries(map).slice(0, 6);
  }, [teamToday]);

  const closeToday = useMemo(() => teamToday?.filter(e => e.event_type === 'sale_closed') || [], [teamToday]);
  const leadsToday = useMemo(() => teamToday?.filter(e => e.event_type === 'lead_submitted') || [], [teamToday]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">
          <span className="text-gradient">Welcome back, {firstName(profile?.full_name)}</span>
        </h1>
        <p className="text-sm text-soft mt-0.5">Here's what needs your attention today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Needs action */}
        <Card>
          <CardTitle icon={AlertTriangle} label="Needs Your Action" color="text-brandred" />
          <StatRow label="Pending sale approvals" value="—" />
          <StatRow label="Hot leads waiting" value={hotDeals?.length ?? '…'} accent={hotDeals?.length > 0 ? 'text-yellow-400' : undefined} />
          <p className="mt-2 text-[11px] text-soft">Approvals queue ships in Brick D.</p>
        </Card>

        {/* Money snapshot */}
        <Card>
          <CardTitle icon={DollarSign} label="Money Snapshot" color="text-green-400" />
          {arLoading ? <Loading /> : (
            <div className="space-y-1">
              <StatRow label="A/R outstanding" value={fmt(arTotal)} accent="text-red-400" />
              <StatRow label="Revenue this month" value={fmt(revenueTotal)} accent="text-green-400" />
              <StatRow label="Commission liability" value={fmt(commTotal)} accent="text-yellow-400" />
            </div>
          )}
        </Card>

        {/* Team today */}
        <Card>
          <CardTitle icon={Activity} label="Team Activity Today" color="text-blue-400" />
          <StatRow label="Events logged" value={teamToday?.length ?? '…'} />
          <StatRow label="Deals closed today" value={closeToday.length} accent={closeToday.length > 0 ? 'text-green-400' : undefined} />
          <StatRow label="Leads captured" value={leadsToday.length} />
          <div className="mt-2 flex flex-wrap gap-1">
            {uniqueActors.map(([id, { role, count }]) => (
              <span key={id} className="rounded bg-darkbg-700 px-1.5 py-0.5 text-[10px] text-soft">
                {role} ×{count}
              </span>
            ))}
            {uniqueActors.length === 0 && <p className="text-[11px] text-soft">No activity yet today.</p>}
          </div>
        </Card>

        {/* Hot deals */}
        <Card className="lg:col-span-2">
          <CardTitle icon={Flame} label="Hot Deals — Close Now" color="text-orange-400" />
          {hotDeals?.length === 0
            ? <p className="text-sm text-soft">No deals in proposal or negotiation.</p>
            : (
              <div className="space-y-1">
                {hotDeals?.map(d => (
                  <div key={d.id} className="flex items-center justify-between border-b border-darkbg-border/30 py-1.5 last:border-0">
                    <div>
                      <p className="text-sm font-semibold">{d.client_name}</p>
                      <p className="text-[11px] text-soft capitalize">{d.stage.replace(/_/g, ' ')}</p>
                    </div>
                    <p className="text-xs text-soft">{fmt(d.monthly_retainer)}/mo</p>
                  </div>
                ))}
              </div>
            )}
        </Card>

        {/* At risk */}
        <Card>
          <CardTitle icon={Clock} label="At Risk — Cold Leads" color="text-red-400" />
          {coldDeals?.length === 0
            ? <p className="text-sm text-soft">No cold leads right now. 🎉</p>
            : (
              <div className="space-y-1">
                {coldDeals?.map(d => {
                  const days = Math.floor((Date.now() - new Date(d.updated_at)) / 86400_000);
                  return (
                    <div key={d.id} className="flex items-center justify-between border-b border-darkbg-border/30 py-1.5 last:border-0">
                      <p className="text-sm">{d.client_name}</p>
                      <span className="text-[11px] text-red-400">{days}d silent</span>
                    </div>
                  );
                })}
              </div>
            )}
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-soft">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          <QuickBtn icon={CheckSquare}   label="View Approvals"    onClick={() => nav('/owner/approvals')} />
          <QuickBtn icon={UserPlus}      label="Add a Lead"        onClick={() => nav('/owner/leads/new')} />
          <QuickBtn icon={GitPullRequest}label="Open Pipeline"     onClick={() => nav('/owner/sales/leads')} />
          <QuickBtn icon={FileBarChart2} label="Monthly Report"    onClick={() => nav('/owner/reports/monthly')} />
        </div>
      </div>

      <FromOthersFeed />
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

function AdminDay({ profile }) {
  const nav = useNavigate();

  const { data: unbankd } = useQuery({
    queryKey: ['my-day-admin-unbanked'],
    queryFn: async () => {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, client_name, created_at')
        .eq('stage', 'closed_won');
      if (!deals?.length) return [];
      const dealIds = deals.map(d => d.id);
      const { data: banked } = await supabase
        .from('client_banking')
        .select('deal_id')
        .in('deal_id', dealIds);
      const bankedSet = new Set((banked || []).map(b => b.deal_id));
      return deals.filter(d => !bankedSet.has(d.id));
    },
  });

  const { data: overdueOnboarding } = useQuery({
    queryKey: ['my-day-admin-onboarding'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data } = await supabase
        .from('client_onboarding')
        .select('id, client_name, current_phase, created_at')
        .eq('current_phase', 'phase1_contract_signed')
        .lt('created_at', cutoff)
        .order('created_at', { ascending: true })
        .limit(10);
      return data || [];
    },
  });

  const { data: myCaptures } = useQuery({
    queryKey: ['my-day-admin-captures'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('client_activity_log')
        .select('created_at')
        .eq('actor_id', user.id)
        .in('event_type', ['lead_submitted', 'banking_captured', 'sale_closed'])
        .gte('created_at', `${todayISO()}T00:00:00`);
      return data || [];
    },
  });

  const { data: weekCaptures } = useQuery({
    queryKey: ['my-day-admin-captures-week'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data } = await supabase
        .from('client_activity_log')
        .select('id')
        .eq('actor_id', user.id)
        .in('event_type', ['lead_submitted', 'banking_captured', 'sale_closed'])
        .gte('created_at', weekAgo);
      return data?.length || 0;
    },
  });

  const { data: arOverdue } = useQuery({
    queryKey: ['my-day-admin-overdue-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, client_name, total_amount, due_date')
        .eq('status', 'overdue')
        .order('due_date', { ascending: true })
        .limit(8);
      return data || [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">
          <span className="text-gradient">Welcome back, {firstName(profile?.full_name)}</span>
        </h1>
        <p className="text-sm text-soft mt-0.5">Your operations queue for today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Today's queue */}
        <Card>
          <CardTitle icon={CheckSquare} label="Today's Queue" color="text-brandred" />
          <StatRow label="Banking not captured" value={unbankd?.length ?? '…'} accent={unbankd?.length > 0 ? 'text-red-400' : undefined} />
          <StatRow label="Onboarding overdue (7d)" value={overdueOnboarding?.length ?? '…'} accent={overdueOnboarding?.length > 0 ? 'text-yellow-400' : undefined} />
          <StatRow label="Overdue invoices" value={arOverdue?.length ?? '…'} accent={arOverdue?.length > 0 ? 'text-orange-400' : undefined} />
        </Card>

        {/* My captures */}
        <Card>
          <CardTitle icon={Award} label="My Captures" color="text-green-400" />
          <StatRow label="Today" value={myCaptures?.length ?? '…'} />
          <StatRow label="This week" value={weekCaptures ?? '…'} />
        </Card>

        {/* Operations health */}
        <Card>
          <CardTitle icon={Activity} label="Operations Health" color="text-blue-400" />
          <StatRow label="Debit failures pending" value="—" />
          <StatRow label="Banking not captured" value={unbankd?.length ?? '…'} accent={unbankd?.length > 0 ? 'text-red-400' : undefined} />
          <StatRow label="Onboarding stuck" value={overdueOnboarding?.length ?? '…'} accent={overdueOnboarding?.length > 0 ? 'text-yellow-400' : undefined} />
          <p className="mt-2 text-[11px] text-soft">Debit failures track in Slice 3 money build.</p>
        </Card>

        {/* Unbanked deals */}
        {unbankd?.length > 0 && (
          <Card className="lg:col-span-2">
            <CardTitle icon={Lock} label="Banking Not Yet Captured" color="text-red-400" />
            <div className="space-y-1">
              {unbankd.slice(0, 6).map(d => {
                const days = Math.floor((Date.now() - new Date(d.created_at)) / 86400_000);
                return (
                  <div key={d.id} className="flex items-center justify-between border-b border-darkbg-border/30 py-1.5 last:border-0">
                    <p className="text-sm">{d.client_name}</p>
                    <span className="text-[11px] text-red-400">+{days}d since close</span>
                  </div>
                );
              })}
              {unbankd.length > 6 && <p className="text-[11px] text-soft">+{unbankd.length - 6} more</p>}
            </div>
          </Card>
        )}

        {/* Overdue invoices */}
        {arOverdue?.length > 0 && (
          <Card>
            <CardTitle icon={AlertTriangle} label="Overdue Invoices" color="text-orange-400" />
            <div className="space-y-1">
              {arOverdue.map(inv => (
                <div key={inv.id} className="flex items-center justify-between border-b border-darkbg-border/30 py-1.5 last:border-0">
                  <p className="text-sm">{inv.client_name}</p>
                  <span className="text-[11px] text-orange-400">{fmt(inv.total_amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-soft">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          <QuickBtn icon={UserPlus}   label="Add a Lead"        onClick={() => nav('/owner/leads/new')} />
          <QuickBtn icon={CheckSquare}label="Verify a Lead"     onClick={() => nav('/owner/leads/inbox')} />
          <QuickBtn icon={Lock}       label="Capture Banking"   onClick={() => nav('/owner/sales/leads')} />
        </div>
      </div>

      <FromOthersFeed />
    </div>
  );
}

// ─── HEAD OF TECH ─────────────────────────────────────────────────────────────

function TechDay({ profile }) {
  const nav = useNavigate();

  const { data: teamActivity } = useQuery({
    queryKey: ['my-day-tech-activity'],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_activity_log')
        .select('actor_role, event_type, event_category, created_at')
        .gte('created_at', `${todayISO()}T00:00:00`)
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const byCategory = useMemo(() => {
    const map = {};
    teamActivity?.forEach(e => {
      map[e.event_category] = (map[e.event_category] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [teamActivity]);

  const byRole = useMemo(() => {
    const map = {};
    teamActivity?.forEach(e => {
      map[e.actor_role] = (map[e.actor_role] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [teamActivity]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">
          <span className="text-gradient">Welcome back, {firstName(profile?.full_name)}</span>
        </h1>
        <p className="text-sm text-soft mt-0.5">System oversight for today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* System pulse */}
        <Card>
          <CardTitle icon={Zap} label="System Pulse" color="text-green-400" />
          <StatRow label="Edge Function errors (24h)" value="—" />
          <StatRow label="RLS denials (24h)" value="—" />
          <StatRow label="Auth events today" value={teamActivity?.filter(e => e.event_category === 'auth').length ?? '…'} />
          <p className="mt-2 text-[11px] text-soft">EF log monitoring ships in Brick H2.</p>
        </Card>

        {/* Team activity */}
        <Card>
          <CardTitle icon={Activity} label="Team Activity Today" color="text-blue-400" />
          <StatRow label="Total events" value={teamActivity?.length ?? '…'} />
          {byRole.map(([role, count]) => (
            <StatRow key={role} label={role} value={count} />
          ))}
        </Card>

        {/* By category */}
        <Card>
          <CardTitle icon={TrendingUp} label="Events by Category" color="text-purple-400" />
          {byCategory.length === 0
            ? <p className="text-sm text-soft">No events logged today yet.</p>
            : byCategory.map(([cat, count]) => (
              <StatRow key={cat} label={cat} value={count} />
            ))
          }
        </Card>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-soft">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          <QuickBtn icon={Lock}     label="Audit Log"       onClick={() => nav('/owner/security/audit')} />
          <QuickBtn icon={Activity} label="Team Activity"   onClick={() => nav('/owner/security/audit')} />
          <QuickBtn icon={Zap}      label="System Settings" onClick={() => nav('/owner/settings')} />
        </div>
      </div>

      <FromOthersFeed />
    </div>
  );
}

// ─── FIELD AGENT ─────────────────────────────────────────────────────────────

function FieldDay({ profile }) {
  const nav = useNavigate();

  const quote = useMemo(() => QUOTES[new Date().getDate() % QUOTES.length], []);

  const { data: myDeals } = useQuery({
    queryKey: ['my-day-field-deals'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('deals')
        .select('id, client_name, stage, setup_fee, monthly_retainer, updated_at, closed_at')
        .eq('closer_id', user.id)
        .order('updated_at', { ascending: false });
      return data || [];
    },
  });

  const { data: myComms } = useQuery({
    queryKey: ['my-day-field-commissions'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('commissions')
        .select('id, commission_type, commission_amount, status, created_at, client_name')
        .eq('staff_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      return data || [];
    },
  });

  const openDeals = useMemo(() => myDeals?.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)) || [], [myDeals]);

  const winsThisMonth = useMemo(() => {
    const start = new Date(monthStart());
    return myDeals?.filter(d => d.stage === 'closed_won' && new Date(d.closed_at) >= start) || [];
  }, [myDeals]);

  const lockedComm = useMemo(() => myComms?.reduce((s, c) => s + Number(c.commission_amount || 0), 0) || 0, [myComms]);

  const atRiskComms = useMemo(() => {
    const cutoff = Date.now() - 21 * 86400_000;
    return myComms?.filter(c => new Date(c.created_at).getTime() < cutoff) || [];
  }, [myComms]);

  const goal = profile?.monthly_goal_wins || 0;
  const wins = winsThisMonth.length;
  const gapText = goal > 0
    ? wins >= goal
      ? `🎉 Goal smashed! ${wins}/${goal}`
      : `${goal - wins} more win${goal - wins !== 1 ? 's' : ''} to reach your goal`
    : 'Set a goal in your profile';
  const goalPct = goal > 0 ? Math.min(wins / goal, 1) : 0;

  return (
    <div className="space-y-6">
      {/* Quote */}
      <div className="rounded-xl border border-darkbg-border/40 bg-darkbg-800/30 px-5 py-3 italic text-soft text-sm">
        "{quote.text}" — <span className="not-italic font-semibold text-white">{quote.author}</span>
      </div>

      <div>
        <h1 className="font-display text-2xl">
          <span className="text-gradient">Welcome back, partner {firstName(profile?.full_name)} 👊</span>
        </h1>
        <p className="text-sm text-soft mt-0.5">Let's get after it today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Dream + number */}
        <Card>
          <CardTitle icon={Target} label="My Dream + My Number" color="text-brandred" />
          {profile?.dream_caption
            ? <p className="text-base font-semibold text-white mb-3">"{profile.dream_caption}"</p>
            : <p className="text-sm text-soft mb-3 italic">No dream set yet — <button className="text-brandred underline" onClick={() => nav('/owner/profile')}>set it in your profile</button></p>
          }
          <div className="flex items-center gap-4">
            <DialRing value={wins} max={goal || 1} />
            <div>
              <p className="text-2xl font-bold text-white">{wins}<span className="text-soft text-base font-normal">/{goal || '?'}</span></p>
              <p className="text-xs text-soft">wins this month</p>
              <p className="text-xs mt-1 text-yellow-400">{gapText}</p>
            </div>
          </div>
        </Card>

        {/* Today's plan */}
        <Card>
          <CardTitle icon={MapPin} label="Today's Plan" color="text-blue-400" />
          <StatRow label="Open deals to chase" value={openDeals.length} accent={openDeals.length > 0 ? 'text-yellow-400' : undefined} />
          <StatRow label="Wins this month" value={wins} accent={wins > 0 ? 'text-green-400' : undefined} />
          <StatRow label="Total deals" value={myDeals?.length ?? '…'} />
        </Card>

        {/* Locked commission */}
        <Card>
          <CardTitle icon={Lock} label="Locked Commission" color="text-green-400" />
          <div className="text-3xl font-bold text-green-400 mb-1">{fmt(lockedComm)}</div>
          <p className="text-xs text-soft mb-3">pending — unlocks when client pays setup fee</p>
          <StatRow label="Commission entries" value={myComms?.length ?? '…'} />
        </Card>

        {/* At risk */}
        {atRiskComms.length > 0 && (
          <Card>
            <CardTitle icon={AlertTriangle} label="⚠️ At Risk — Chase Setup Fee" color="text-red-400" />
            <p className="text-xs text-soft mb-2">These deals are 21+ days old — commission at risk if setup fee not paid:</p>
            <div className="space-y-1">
              {atRiskComms.map(c => {
                const days = Math.floor((Date.now() - new Date(c.created_at)) / 86400_000);
                return (
                  <div key={c.id} className="flex items-center justify-between border-b border-darkbg-border/30 py-1.5 last:border-0">
                    <p className="text-sm">{c.client_name}</p>
                    <span className="text-[11px] text-red-400">{fmt(c.commission_amount)} · {days}d</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Open deals */}
        {openDeals.length > 0 && (
          <Card className="lg:col-span-2">
            <CardTitle icon={GitPullRequest} label="My Open Deals" color="text-yellow-400" />
            <div className="space-y-1">
              {openDeals.slice(0, 5).map(d => {
                const days = Math.floor((Date.now() - new Date(d.updated_at)) / 86400_000);
                return (
                  <div key={d.id} className="flex items-center justify-between border-b border-darkbg-border/30 py-1.5 last:border-0">
                    <div>
                      <p className="text-sm font-semibold">{d.client_name}</p>
                      <p className="text-[11px] text-soft capitalize">{d.stage.replace(/_/g, ' ')}</p>
                    </div>
                    <span className={`text-[11px] ${days > 7 ? 'text-red-400' : 'text-soft'}`}>last touch {days}d ago</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-soft">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          <QuickBtn icon={MapPin}       label="Log a Visit"         onClick={() => nav('/owner/activity/visits')} />
          <QuickBtn icon={UserPlus}     label="Add a Lead"          onClick={() => nav('/owner/leads/new')} />
          <QuickBtn icon={Clock}        label="Schedule Follow-up"  onClick={() => nav('/owner/tasks')} />
          <QuickBtn icon={MessageSquare}label="Quick Update"        onClick={() => nav('/owner/comms/messages')} />
        </div>
      </div>

      <FromOthersFeed />
    </div>
  );
}

// ─── CPC ──────────────────────────────────────────────────────────────────────

// Dial targets locked per spec (until Brick E ships)
const DIAL_TARGETS = { day: 200, week: 1000, month: 20_000 };

function CPCDay({ profile }) {
  const nav = useNavigate();

  const quote = useMemo(() => QUOTES[(new Date().getDate() + 3) % QUOTES.length], []);

  const { data: myComms } = useQuery({
    queryKey: ['my-day-cpc-commissions'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('commissions')
        .select('id, commission_type, commission_amount, status, created_at, client_name')
        .eq('staff_id', user.id)
        .eq('status', 'pending');
      return data || [];
    },
  });

  const { data: myColdLeads } = useQuery({
    queryKey: ['my-day-cpc-cold'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { data } = await supabase
        .from('deals')
        .select('id, client_name, stage, updated_at')
        .eq('cpc_id', user.id)
        .in('stage', ['new_lead', 'discovery_visit'])
        .lt('updated_at', cutoff)
        .order('updated_at', { ascending: true })
        .limit(8);
      return data || [];
    },
  });

  const lockedFees = useMemo(() => myComms?.reduce((s, c) => s + Number(c.commission_amount || 0), 0) || 0, [myComms]);

  // Dial data: Brick E not yet built — show targets with 0
  const dialDay = 0;
  const dialWeek = 0;
  const dialMonth = 0;

  function dialColor(val, max) {
    const p = val / max;
    return p >= 1 ? '#22c55e' : p >= 0.6 ? '#f59e0b' : '#ef4444';
  }

  return (
    <div className="space-y-6">
      {/* Quote */}
      <div className="rounded-xl border border-darkbg-border/40 bg-darkbg-800/30 px-5 py-3 italic text-soft text-sm">
        "{quote.text}" — <span className="not-italic font-semibold text-white">{quote.author}</span>
      </div>

      <div>
        <h1 className="font-display text-2xl">
          <span className="text-gradient">Welcome back, partner {firstName(profile?.full_name)} 👊</span>
        </h1>
        <p className="text-sm text-soft mt-0.5">Dial. Qualify. Repeat.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Dial counters */}
        <Card className="xl:col-span-2">
          <CardTitle icon={Phone} label="My Dials" color="text-blue-400" />
          <p className="text-[11px] text-soft mb-3">Dial tracking goes live in Brick E — counts below will populate then.</p>
          <div className="flex gap-6 flex-wrap">
            {[
              { label: 'Today', val: dialDay, max: DIAL_TARGETS.day },
              { label: 'This Week', val: dialWeek, max: DIAL_TARGETS.week },
              { label: 'This Month', val: dialMonth, max: DIAL_TARGETS.month },
            ].map(({ label, val, max }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <DialRing value={val} max={max} color={dialColor(val, max)} />
                <p className="text-xs font-semibold text-white">{val.toLocaleString()}<span className="text-soft">/{max.toLocaleString()}</span></p>
                <p className="text-[10px] text-soft">{label}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* My pending stuff */}
        <Card>
          <CardTitle icon={Target} label="My Pending" color="text-yellow-400" />
          <StatRow label="Pending approvals" value="—" />
          <StatRow label="Locked lead fees" value={fmt(lockedFees)} accent={lockedFees > 0 ? 'text-green-400' : undefined} />
          <StatRow label="Commission entries" value={myComms?.length ?? '…'} />
          <p className="mt-2 text-[11px] text-soft">Lead-provenance approvals ship in Brick D.</p>
        </Card>

        {/* Cold leads */}
        <Card className="lg:col-span-2">
          <CardTitle icon={AlertTriangle} label="My Cold Leads (7d+ silent)" color="text-red-400" />
          {myColdLeads?.length === 0
            ? <p className="text-sm text-soft">No cold leads — great work! 🎉</p>
            : (
              <div className="space-y-1">
                {myColdLeads?.map(d => {
                  const days = Math.floor((Date.now() - new Date(d.updated_at)) / 86400_000);
                  return (
                    <div key={d.id} className="flex items-center justify-between border-b border-darkbg-border/30 py-1.5 last:border-0">
                      <div>
                        <p className="text-sm font-semibold">{d.client_name}</p>
                        <p className="text-[11px] text-soft capitalize">{d.stage.replace(/_/g, ' ')}</p>
                      </div>
                      <span className="text-[11px] text-red-400">{days}d silent</span>
                    </div>
                  );
                })}
              </div>
            )}
        </Card>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-soft">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          <QuickBtn icon={Phone}        label="Log a Call"          onClick={() => nav('/owner/activity/dials')} />
          <QuickBtn icon={UserPlus}     label="Add a Lead"          onClick={() => nav('/owner/leads/new')} />
          <QuickBtn icon={Zap}          label="Claim Self-sourced"  onClick={() => nav('/owner/leads/my')} />
          <QuickBtn icon={MessageSquare}label="Quick Update"        onClick={() => nav('/owner/comms/messages')} />
        </div>
      </div>

      <FromOthersFeed />
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function MyDay() {
  const { profile, role } = useAuth();

  if (!role) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Mascot size={52} className="mb-4 opacity-60" />
      <p className="text-soft text-sm">Loading your day…</p>
    </div>
  );

  if (role === 'owner')       return <OwnerDay profile={profile} />;
  if (role === 'admin')       return <AdminDay profile={profile} />;
  if (role === 'head_of_tech') return <TechDay profile={profile} />;
  if (role === 'field_agent') return <FieldDay profile={profile} />;
  if (role === 'cpc')         return <CPCDay profile={profile} />;

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Mascot size={52} className="mb-4 opacity-60" />
      <p className="text-soft">No dashboard configured for role: <code>{role}</code></p>
    </div>
  );
}
