import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, FileSignature, BarChart3, MessageCircle, Phone, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import Mascot from '../../components/Mascot.jsx';
import { pickHeroCopy } from '../../constants/heroCopy.js';

const LOGO_URL = 'https://yyrzppuntgtvurnnksfc.supabase.co/storage/v1/object/public/brand-assets/logo_email.png';
const WHATSAPP_URL = 'https://wa.me/27768038987';
const PACKAGE_LABEL = { ignite: 'Ignite', accelerate: 'Accelerate', dominate: 'Dominate', add_on: 'Add-on', custom: 'Custom' };

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function Portal() {
  const [splashDone, setSplashDone] = useState(() => sessionStorage.getItem('mio_splash_seen') === '1');

  useEffect(() => {
    if (splashDone) return;
    const t = setTimeout(() => { sessionStorage.setItem('mio_splash_seen', '1'); setSplashDone(true); }, 3000);
    return () => clearTimeout(t);
  }, [splashDone]);

  const dashQ = useQuery({
    queryKey: ['client-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_dashboard');
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
  });

  if (!splashDone) return <SplashScreen />;
  if (dashQ.isLoading) return <div className="flex justify-center py-24"><Loader2 size={28} className="animate-spin text-gray-300" /></div>;
  if (dashQ.isError) return <div className="text-red-600 text-sm py-8">{dashQ.error?.message}</div>;

  const d = dashQ.data;
  const client = d.client || {};
  const deal = d.deal;
  const onboarding = d.onboarding;
  const contract = d.contract;
  const pkgLabel = PACKAGE_LABEL[deal?.package] ?? deal?.package;
  const onboardingHref = onboarding?.onboarding_token ? `/onboard/${onboarding.onboarding_token}` : '/client/onboarding';

  const heroCopy = pickHeroCopy({
    hasPackage: !!deal?.package,
    onboarding,
    overdueInvoices: d.overdue_invoices || 0,
    missingAddons: [],
  });

  return (
    <div className="relative">
      {/* Subtle circuit-board texture behind everything */}
      <CircuitBackground />

      <div className="relative z-10 max-w-4xl mx-auto space-y-4">
        {/* 1. HERO */}
        <section className="bg-white/85 backdrop-blur-xl rounded-2xl border border-white/80 shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-3">
            <div className="lg:col-span-2 p-6 sm:p-8 flex flex-col justify-center">
              <p className="text-xs font-semibold tracking-[0.2em] text-red-500 uppercase mb-2">Welcome back</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#0B2143]">
                {client.business_name || client.contact_person || 'Welcome'}
              </h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {pkgLabel && (
                  <span className="rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold ring-1 ring-blue-200">
                    {pkgLabel} Package
                  </span>
                )}
                {contract?.client_signed_at && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold ring-1 ring-emerald-200">
                    <CheckCircle2 size={12} /> Signed
                  </span>
                )}
              </div>
              <p className="mt-4 text-sm text-gray-500 italic max-w-md">"{heroCopy}"</p>
            </div>
            <div className="flex items-center justify-center p-6 bg-gradient-to-br from-rose-50 to-purple-50 min-h-[160px]">
              <Mascot size={140} />
            </div>
          </div>
        </section>

        {/* 2. STATUS CARDS */}
        <div className="grid grid-cols-3 gap-3">
          <StatusCard to={onboardingHref} tone="text-amber-600" label="Onboarding"
                      value={onboarding ? `${onboarding.triggers_done} of 4` : '—'} />
          <StatusCard to="/client/invoices" tone="text-red-600" label="Invoices"
                      value={d.outstanding_invoices > 0 ? `R${Number(d.outstanding_amount).toLocaleString('en-ZA')}` : 'All paid ✅'} />
          <StatusCard to="/client/deliverables" tone="text-blue-600" label="Deliverables"
                      value={`${d.active_deliverables || 0} active`} />
        </div>

        {/* 3. QUICK LINKS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { to: '/client/contracts', icon: FileSignature, label: 'Contracts' },
            { to: '/client/reports', icon: BarChart3, label: 'Reports' },
            { to: '/client/messages', icon: MessageCircle, label: 'Messages' },
            { href: WHATSAPP_URL, icon: Phone, label: 'Contact us' },
          ].map(link => {
            const inner = (
              <>
                <link.icon size={20} className="mx-auto mb-1 text-[#0B2143]" />
                <span className="text-xs font-semibold text-[#0B2143]">{link.label}</span>
              </>
            );
            const cls = 'block bg-white/75 backdrop-blur rounded-xl border border-white/80 p-3 text-center hover:shadow-md transition';
            return link.href
              ? <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
              : <Link key={link.label} to={link.to} className={cls}>{inner}</Link>;
          })}
        </div>

        {/* 4. RECENT ACTIVITY */}
        {d.recent_notifications?.length > 0 && (
          <section className="bg-white/85 backdrop-blur rounded-xl border border-white/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recent Activity</h2>
              <Link to="/client/activity" className="text-xs text-red-500 font-semibold hover:underline">View all →</Link>
            </div>
            <div className="space-y-2">
              {d.recent_notifications.slice(0, 4).map(n => (
                <Link key={n.id} to={n.action_url || '/client/activity'} className="flex items-start gap-3 text-sm group">
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.is_read ? 'bg-gray-200' : 'bg-red-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 truncate group-hover:text-[#0B2143]">{n.title}</p>
                    <p className="text-xs text-gray-400">{timeAgo(n.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 5. FOOTER */}
        <footer className="text-center pt-4 pb-8 text-xs text-gray-400">
          Marketing iO (Pty) Ltd · 2026/303502/07 ·{' '}
          <a href="mailto:info@marketingio.co.za" className="text-red-400 hover:underline">info@marketingio.co.za</a>
        </footer>
      </div>
    </div>
  );
}

function StatusCard({ to, tone, label, value }) {
  return (
    <Link to={to} className="bg-white/85 backdrop-blur rounded-xl border border-white/80 shadow-sm p-4 hover:shadow-md transition group">
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${tone}`}>{label}</p>
      <p className="text-lg sm:text-xl font-bold text-[#0B2143] mt-1 truncate">{value}</p>
      <p className="text-xs text-gray-400 group-hover:text-red-500 transition">View →</p>
    </Link>
  );
}

function SplashScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50">
      <img src={LOGO_URL} alt="Marketing iO" className="h-16 mb-4 object-contain" />
      <p className="text-sm text-red-500 font-semibold tracking-[0.2em] uppercase">Too good to stay hidden</p>
      <Loader2 className="mt-6 animate-spin text-gray-300" size={24} />
    </div>
  );
}

// Faint circuit-board pattern — pure SVG, no external asset.
function CircuitBackground() {
  return (
    <svg className="fixed inset-0 w-full h-full opacity-[0.04] pointer-events-none" aria-hidden="true">
      <defs>
        <pattern id="circuit" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M10 10h30v20h20M10 50v20h40M60 10v30h10" stroke="#0B2143" strokeWidth="1.5" fill="none" />
          <circle cx="10" cy="10" r="2.5" fill="#0B2143" />
          <circle cx="60" cy="30" r="2.5" fill="#0B2143" />
          <circle cx="50" cy="70" r="2.5" fill="#0B2143" />
          <circle cx="70" cy="40" r="2.5" fill="#E2293B" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#circuit)" />
    </svg>
  );
}
