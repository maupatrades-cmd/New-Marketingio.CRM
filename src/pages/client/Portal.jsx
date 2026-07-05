import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileSignature, Receipt, Package, ClipboardCheck, MessageCircle, BarChart3,
  Loader2, ArrowRight, Bell, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const WHATSAPP_URL = 'https://wa.me/27768038987';
const PACKAGE_LABEL = { ignite: 'Ignite', accelerate: 'Accelerate', dominate: 'Dominate', add_on: 'Add-on', custom: 'Custom' };
const fmtZar = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

export default function Portal() {
  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_dashboard');
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
  });

  if (dashQ.isLoading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  if (dashQ.isError) return <div className="text-red-600 text-sm py-8">{dashQ.error?.message}</div>;

  const { client, deal, contract, onboarding, outstanding_invoices, outstanding_amount, active_deliverables, recent_notifications } = dashQ.data;
  const pkgLabel = PACKAGE_LABEL[deal?.package] ?? deal?.package;
  const triggerCount = onboarding?.triggers_done ?? 0;
  const onboardingHref = onboarding?.onboarding_token ? `/onboard/${onboarding.onboarding_token}` : '/client/onboarding';

  return (
    <div className="space-y-6">
      {/* Welcome banner (first-visit) */}
      {!client?.has_seen_welcome && (
        <div className="rounded-2xl border border-red-100 bg-gradient-to-r from-red-50 to-purple-50 p-5">
          <p className="font-display text-lg text-[#0B2143]">Welcome to Marketing iO, {client?.business_name || client?.contact_person}!</p>
          <p className="text-sm text-gray-500 mt-1">Here's your marketing dashboard — everything about your account in one place.</p>
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6">
        <div className="flex items-start gap-4">
          {client?.logo_url && (
            <img src={client.logo_url} alt="" className="h-14 w-14 rounded-lg bg-white object-contain p-1" />
          )}
          <div className="flex-1">
            <h1 className="font-display text-2xl text-[#0B2143]">{client?.business_name || client?.contact_person}</h1>
            <p className="text-sm text-gray-500 mt-1">Welcome back to your Marketing iO portal.</p>
            {pkgLabel && (
              <span className="inline-block mt-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 ring-1 ring-blue-200 uppercase">{pkgLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusCard title="Contract" icon={FileSignature}
          value={contract ? (contract.client_signed_at ? 'Signed' : 'Awaiting signature') : 'Not set up'}
          tone={contract?.client_signed_at ? 'good' : 'warn'}
          hint={contract?.client_signed_at ? new Date(contract.client_signed_at).toLocaleDateString('en-ZA') : null}
          to="/client/contracts" />
        <StatusCard title="Onboarding" icon={ClipboardCheck}
          value={onboarding ? `${triggerCount} of 4` : 'Not started'}
          tone={triggerCount === 4 ? 'good' : 'warn'}
          hint={triggerCount < 4 ? 'Complete remaining steps' : 'All done!'}
          to={onboardingHref} />
        <StatusCard title="Invoices" icon={Receipt}
          value={outstanding_invoices > 0 ? fmtZar(outstanding_amount) : 'All paid'}
          tone={outstanding_invoices > 0 ? 'bad' : 'good'}
          hint={outstanding_invoices > 0 ? `${outstanding_invoices} outstanding` : null}
          to="/client/invoices" />
        <StatusCard title="Deliverables" icon={Package}
          value={active_deliverables > 0 ? `${active_deliverables} active` : 'None pending'}
          tone="info" to="/client/deliverables" />
      </div>

      {/* Quick actions */}
      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-semibold text-[#0B2143] uppercase tracking-widest">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ActionRow to="/client/contracts" icon={FileSignature} label="View my contract" />
          <ActionRow to="/client/invoices" icon={Receipt} label="View invoices" />
          <ActionRow to="/client/deliverables" icon={Package} label="Track deliverables" />
          <ActionRow to="/client/reports" icon={BarChart3} label="Monthly reports" />
          <ActionRow to="/client/messages" icon={MessageCircle} label="Messages" />
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
             className="group flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 hover:border-red-300 hover:shadow-md transition-all duration-200">
            <span className="flex items-center gap-3">
              <MessageCircle size={18} className="text-emerald-600" />
              <span className="text-sm text-[#0B2143]">Contact us on WhatsApp</span>
            </span>
            <ArrowRight size={16} className="text-gray-500 group-hover:text-[#0B2143] transition" />
          </a>
        </div>
      </section>

      {/* Activity feed */}
      {recent_notifications?.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0B2143] uppercase tracking-widest">Recent activity</h2>
            <Link to="/client/notifications" className="text-xs text-red-500 hover:text-red-600">See all</Link>
          </div>
          <ul className="space-y-2">
            {recent_notifications.map(n => (
              <li key={n.id}>
                <Link to={n.action_url || '/client/notifications'}
                      className={`block rounded-lg border border-gray-100 bg-gray-50 p-3 hover:border-red-300 transition ${!n.is_read ? 'border-red-300' : ''}`}>
                  <div className="flex items-start gap-2">
                    {!n.is_read
                      ? <Bell size={14} className="mt-0.5 text-red-500 shrink-0" />
                      : <CheckCircle2 size={14} className="mt-0.5 text-gray-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#0B2143]">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-gray-500 mt-1">{new Date(n.created_at).toLocaleString('en-ZA')}</p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatusCard({ title, icon: Icon, value, tone, hint, to }) {
  const toneCls = { good: 'border-emerald-200 bg-emerald-50/60', warn: 'border-amber-200 bg-amber-50/60', bad: 'border-red-200 bg-red-50/60', info: 'border-blue-200 bg-blue-50/60' }[tone] || 'border-gray-200';
  const iconCls = { good: 'text-emerald-500', warn: 'text-amber-500', bad: 'text-red-500', info: 'text-blue-500' }[tone] || 'text-gray-500';
  return (
    <Link to={to} className={`block rounded-xl border ${toneCls} p-4 transition hover:scale-[1.02] hover:shadow-md duration-200`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">{title}</span>
        <Icon size={14} className={iconCls} />
      </div>
      <p className="text-base font-semibold text-[#0B2143]">{value}</p>
      {hint && <p className="text-[10px] text-gray-500 mt-0.5">{hint}</p>}
    </Link>
  );
}

function ActionRow({ to, icon: Icon, label }) {
  return (
    <Link to={to}
          className="group flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 hover:border-red-300 hover:shadow-md transition-all duration-200">
      <span className="flex items-center gap-3">
        <Icon size={18} className="text-gray-500 group-hover:text-red-500 transition" />
        <span className="text-sm text-[#0B2143]">{label}</span>
      </span>
      <ArrowRight size={16} className="text-gray-500 group-hover:text-[#0B2143] transition" />
    </Link>
  );
}
