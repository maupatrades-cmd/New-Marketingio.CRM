import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileSignature, Receipt, Package, ClipboardCheck, MessageCircle,
  CheckCircle2, AlertCircle, Loader2, ArrowRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const WHATSAPP_URL = 'https://wa.me/27768038987';

const PACKAGE_LABEL = {
  ignite: 'Ignite',
  accelerate: 'Accelerate',
  dominate: 'Dominate',
  add_on: 'Add-on',
  custom: 'Custom',
};

export default function Portal() {
  const summaryQ = useQuery({
    queryKey: ['client-portal-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_portal_summary');
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
  });

  if (summaryQ.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-soft" /></div>;
  }
  if (summaryQ.isError) {
    return <div className="text-rose-400 text-sm py-8">{summaryQ.error?.message}</div>;
  }

  const { client, deal, contract, onboarding, outstanding_invoices, pending_deliverables } = summaryQ.data;
  const pkgLabel = PACKAGE_LABEL[deal?.package] ?? deal?.package;
  const triggerCount = [
    onboarding?.trigger_setup_fee_paid,
    onboarding?.trigger_onboarding_form_returned,
    onboarding?.trigger_debit_mandate_signed,
    onboarding?.trigger_brand_assets_received,
  ].filter(Boolean).length;

  const onboardingHref = onboarding?.onboarding_token
    ? `/onboard/${onboarding.onboarding_token}`
    : '/client/onboarding';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-darkbg-border bg-gradient-to-br from-darkbg-800/80 to-darkbg-900 p-6">
        <div className="flex items-start gap-4">
          {client?.logo_url && (
            <img src={client.logo_url} alt="" className="h-14 w-14 rounded-lg bg-white object-contain p-1" />
          )}
          <div className="flex-1">
            <h1 className="font-display text-2xl text-gradient">{client?.business_name || client?.contact_person || 'Welcome'}</h1>
            <p className="text-sm text-soft mt-1">Welcome back to your Marketing iO portal.</p>
            {pkgLabel && (
              <span className="inline-block mt-2 rounded-full border border-blue-400/40 bg-blue-400/10 px-2 py-0.5 text-xs text-blue-300 uppercase">
                {pkgLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="Contract"
          icon={FileSignature}
          value={contract ? (contract.client_signed_at ? 'Signed' : 'Awaiting signature') : 'Not set up'}
          tone={contract?.client_signed_at ? 'good' : 'warn'}
          hint={contract?.client_signed_at && new Date(contract.client_signed_at).toLocaleDateString('en-ZA')}
          to="/client/contracts"
        />
        <StatusCard
          title="Onboarding"
          icon={ClipboardCheck}
          value={onboarding ? `${triggerCount} of 4` : 'Not started'}
          tone={triggerCount === 4 ? 'good' : 'warn'}
          hint={triggerCount < 4 ? 'Complete remaining steps' : 'All done!'}
          to={onboardingHref}
        />
        <StatusCard
          title="Invoices"
          icon={Receipt}
          value={outstanding_invoices > 0 ? `${outstanding_invoices} outstanding` : 'All paid'}
          tone={outstanding_invoices > 0 ? 'bad' : 'good'}
          to="/client/invoices"
        />
        <StatusCard
          title="Deliverables"
          icon={Package}
          value={pending_deliverables > 0 ? `${pending_deliverables} in progress` : 'Nothing pending'}
          tone="info"
          to="/client/deliverables"
        />
      </div>

      {/* Quick actions */}
      <section className="rounded-2xl border border-darkbg-border bg-darkbg-800/50 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-white uppercase tracking-widest">Quick actions</h2>
        <ActionRow to="/client/contracts" icon={FileSignature} label="View my contract" />
        <ActionRow to="/client/invoices"  icon={Receipt}        label="View my invoices" />
        <ActionRow to="/client/deliverables" icon={Package}     label="Track deliverables" />
        {onboarding && triggerCount < 4 && (
          <ActionRow to={onboardingHref} icon={ClipboardCheck} label="Complete onboarding form" />
        )}
        <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
           className="group flex items-center justify-between rounded-lg border border-darkbg-border bg-darkbg-900/50 px-4 py-3 hover:border-brandred transition">
          <span className="flex items-center gap-3">
            <MessageCircle size={18} className="text-emerald-400" />
            <span className="text-sm text-white">Contact us on WhatsApp</span>
          </span>
          <ArrowRight size={16} className="text-soft group-hover:text-white transition" />
        </a>
      </section>
    </div>
  );
}

function StatusCard({ title, icon: Icon, value, tone, hint, to }) {
  const toneCls = {
    good: 'border-emerald-500/30 bg-emerald-500/5',
    warn: 'border-amber-500/30 bg-amber-500/5',
    bad:  'border-rose-500/30 bg-rose-500/5',
    info: 'border-blue-500/30 bg-blue-500/5',
  }[tone] || 'border-darkbg-border';
  const iconCls = {
    good: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-rose-400', info: 'text-blue-400',
  }[tone] || 'text-soft';
  return (
    <Link to={to} className={`block rounded-xl border ${toneCls} p-4 transition hover:scale-[1.02]`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-soft">{title}</span>
        <Icon size={16} className={iconCls} />
      </div>
      <p className="text-lg font-semibold text-white">{value}</p>
      {hint && <p className="text-xs text-soft mt-0.5">{hint}</p>}
    </Link>
  );
}

function ActionRow({ to, icon: Icon, label }) {
  return (
    <Link to={to}
          className="group flex items-center justify-between rounded-lg border border-darkbg-border bg-darkbg-900/50 px-4 py-3 hover:border-brandred transition">
      <span className="flex items-center gap-3">
        <Icon size={18} className="text-soft group-hover:text-brandred transition" />
        <span className="text-sm text-white">{label}</span>
      </span>
      <ArrowRight size={16} className="text-soft group-hover:text-white transition" />
    </Link>
  );
}
