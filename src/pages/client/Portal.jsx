import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileSignature, BarChart3, MessageCircle, Phone, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import Mascot from '../../components/Mascot.jsx';
import MascotGuide from '../../components/MascotGuide.jsx';
import StardustButton from '../../components/ui/StardustButton.jsx';
import ShaderBackground from '../../components/ui/ShaderBackground.jsx';
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
  const navigate = useNavigate();
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
  if (dashQ.isLoading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="thinking" size={100} message="Loading your dashboard..." position="inline" />
    </div>
  );
  if (dashQ.isError) return (
    <div className="flex flex-col items-center justify-center py-20">
      <MascotGuide phase="sad" size={100} message={dashQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
    </div>
  );

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
    <>
      {/* Rich navy shader canvas — scoped to the dashboard only */}
      <ShaderBackground />

      <div className="relative z-10 max-w-4xl mx-auto space-y-4">
        {/* 1. HERO — light glass card with ambient corner glow */}
        <section className="relative overflow-hidden bg-white/95 rounded-2xl border border-slate-200 shadow-sm animate-fade-in-up">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-200/30 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-rose-200/30 rounded-full blur-3xl pointer-events-none" />
          <div className="relative grid grid-cols-1 lg:grid-cols-3">
            <div className="lg:col-span-2 p-6 sm:p-8 flex flex-col justify-center">
              <p className="text-xs font-semibold tracking-[0.2em] text-[#E2293B] uppercase mb-2">Welcome back</p>
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
                    ✓ Signed
                  </span>
                )}
              </div>
              <p className="mt-4 text-sm text-slate-600 italic max-w-md leading-relaxed">"{heroCopy}"</p>
            </div>
            <div className="flex items-center justify-center p-6 bg-gradient-to-br from-rose-100/60 to-purple-100/60 min-h-[160px]">
              <Mascot size={160} />
            </div>
          </div>
        </section>

        {/* 2. STATUS CARDS — colored per category */}
        <div className="grid grid-cols-3 gap-3 animate-fade-in-up">
          <Link to={onboardingHref}
                className="rounded-xl p-4 transition hover:shadow-md hover:scale-[1.02]"
                style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Onboarding</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">{onboarding?.triggers_done || 0} of 4</p>
            <p className="text-xs text-amber-600/70 mt-1">View →</p>
          </Link>

          <Link to="/client/invoices"
                className="rounded-xl p-4 transition hover:shadow-md hover:scale-[1.02]"
                style={{
                  background: d.overdue_invoices > 0 ? '#FEF2F2' : '#ECFDF5',
                  border: `1px solid ${d.overdue_invoices > 0 ? '#FECACA' : '#A7F3D0'}`,
                }}>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${d.overdue_invoices > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              Invoices
            </p>
            <p className={`text-2xl font-bold mt-1 truncate ${d.overdue_invoices > 0 ? 'text-red-800' : 'text-emerald-800'}`}>
              {d.outstanding_invoices > 0 ? `R${Number(d.outstanding_amount).toLocaleString('en-ZA')}` : 'All paid ✅'}
            </p>
            <p className="text-xs text-slate-500 mt-1">View →</p>
          </Link>

          <Link to="/client/deliverables"
                className="rounded-xl p-4 transition hover:shadow-md hover:scale-[1.02]"
                style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Deliverables</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">{d.active_deliverables || 0} active</p>
            <p className="text-xs text-blue-600/70 mt-1">View →</p>
          </Link>
        </div>

        {/* 2b. UPSELL — hidden for top-tier / custom clients */}
        {deal?.package !== 'dominate' && deal?.package !== 'custom' && (
          <section className="relative overflow-hidden bg-white/95 rounded-2xl border border-slate-200 shadow-sm">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-200/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-rose-200/30 rounded-full blur-3xl pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row items-center gap-6 p-6 sm:p-8">
              <div className="flex-1 text-center sm:text-left">
                <p className="text-xs font-semibold tracking-[0.2em] text-[#E2293B] uppercase mb-2">Ready to grow?</p>
                <h2 className="text-xl sm:text-2xl font-bold text-[#0B2143]">
                  Unlock more with your next package
                </h2>
                <p className="mt-2 text-sm text-slate-600 max-w-md">
                  Explore what Accelerate and Dominate can do for your brand.
                </p>
              </div>
              <StardustButton onClick={() => navigate('/client/products')}>
                Upgrade Package
              </StardustButton>
            </div>
          </section>
        )}

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
                <link.icon size={20} className="mx-auto mb-1.5 text-[#0B2143]" />
                <span className="text-xs font-semibold text-[#0B2143]">{link.label}</span>
              </>
            );
            const cls = 'block bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 p-3 text-center hover:shadow-md hover:border-[#E2293B]/30 transition cursor-pointer';
            return link.href
              ? <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
              : <Link key={link.label} to={link.to} className={cls}>{inner}</Link>;
          })}
        </div>

        {/* 4. RECENT ACTIVITY */}
        {d.recent_notifications?.length > 0 && (
          <section className="bg-white/95 rounded-xl border border-slate-200 shadow-sm p-4 animate-fade-in-up">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent Activity</h2>
              <Link to="/client/activity" className="text-xs text-[#E2293B] font-semibold hover:underline">View all →</Link>
            </div>
            <div className="space-y-2">
              {d.recent_notifications.slice(0, 4).map(n => (
                <Link key={n.id} to={n.action_url || '/client/activity'} className="flex items-start gap-3 text-sm group">
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.is_read ? 'bg-slate-200' : 'bg-[#E2293B]'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700 truncate group-hover:text-[#0B2143]">{n.title}</p>
                    <p className="text-xs text-slate-400">{timeAgo(n.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 5. FOOTER */}
        <footer className="text-center pt-4 pb-8 text-xs text-white/70">
          Marketing iO (Pty) Ltd · 2026/303502/07 ·{' '}
          <a href="mailto:info@marketingio.co.za" className="text-red-300 hover:text-red-200 hover:underline">info@marketingio.co.za</a>
        </footer>
      </div>
    </>
  );
}


function SplashScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50">
      <img src={LOGO_URL} alt="Marketing iO" className="h-16 mb-4 object-contain" />
      <p className="text-sm text-red-500 font-semibold tracking-[0.2em] uppercase">Too good to stay hidden</p>
      <div className="mt-6">
        <MascotGuide phase="thinking" size={80} position="inline" />
      </div>
    </div>
  );
}

