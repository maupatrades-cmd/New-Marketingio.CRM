import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileSignature, BarChart3, MessageCircle, Phone, CheckCircle2,
  Flame, Rocket, Crown, MapPin,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import Mascot from '../../components/Mascot.jsx';
import MascotGuide from '../../components/MascotGuide.jsx';
import StardustButton from '../../components/ui/StardustButton.jsx';
import ShaderBackground from '../../components/ui/ShaderBackground.jsx';
import { pickHeroCopy } from '../../constants/heroCopy.js';

const CARDS_BUCKET = 'https://yyrzppuntgtvurnnksfc.supabase.co/storage/v1/object/public/cards';

const TIER_ORDER = ['ignite', 'accelerate', 'dominate'];
const TIERS = [
  {
    code: 'ignite',
    name: 'Ignite',
    tagline: 'Spark your presence',
    blurb: 'Establish a professional footprint with core social + brand essentials.',
    Icon: Flame,
    accent: '#F97316',
    image: `${CARDS_BUCKET}/ignite.png`,
  },
  {
    code: 'accelerate',
    name: 'Accelerate',
    tagline: 'Scale your reach',
    blurb: 'Full-service content engine — paid campaigns, monthly reports, priority queue.',
    Icon: Rocket,
    accent: '#E2293B',
    image: `${CARDS_BUCKET}/accelerate.png`,
  },
  {
    code: 'dominate',
    name: 'Dominate',
    tagline: 'Own your market',
    blurb: 'End-to-end strategy, senior team, priority support, and everything Accelerate offers.',
    Icon: Crown,
    accent: '#F5B500',
    image: `${CARDS_BUCKET}/dominate.png`,
  },
];

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function TimeLocationWidget({ location }) {
  const now = useNow(30_000);
  const time = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div className="hidden md:flex fixed bottom-4 right-4 z-30 luxe-glass-dark rounded-xl px-4 py-2.5 items-center gap-3">
      <div className="font-display text-2xl font-bold text-white tracking-wider tabular-nums leading-none">{time}</div>
      <div className="flex items-center gap-1 text-[10px] text-white/75 uppercase tracking-widest">
        <MapPin size={10} className="text-white/60" />
        <span className="max-w-[180px] truncate">{location || 'South Africa'}</span>
      </div>
    </div>
  );
}

function TierCard({ tier, state, onUpgrade, onGet, onEnquire }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isCurrent  = state === 'current';
  const isBelow    = state === 'below';   // already surpassed — can't downgrade
  const isAbove    = state === 'above';   // upgrade opportunity
  const isDominate = tier.code === 'dominate';

  const containerClass = isCurrent
    ? 'border-[#0B2143] shadow-lg scale-[1.02]'
    : isBelow
      ? 'border-slate-200 opacity-70'
      : 'border-slate-200 hover:border-slate-300 hover:shadow-md';

  const bg = isCurrent
    ? 'linear-gradient(180deg, #0B2143 0%, #061638 100%)'
    : isBelow ? '#F8FAFC' : '#ffffff';

  return (
    <div className={`relative overflow-hidden rounded-xl p-5 transition-all duration-300 border flex flex-col ${containerClass}`}
         style={{ background: bg }}>

      {isCurrent && (
        <span className="absolute top-3 right-3 z-10 rounded-full bg-white/15 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-1 backdrop-blur">
          Current
        </span>
      )}
      {isBelow && (
        <span className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold uppercase tracking-widest px-2 py-1">
          <CheckCircle2 size={9} /> Unlocked
        </span>
      )}

      <div
        className="w-full h-36 sm:h-40 rounded-xl flex items-center justify-center mb-4 overflow-hidden"
        style={{ background: isCurrent ? 'rgba(255,255,255,0.06)' : `${tier.accent}10` }}
      >
        {tier.image && !imgFailed ? (
          <img
            src={tier.image}
            alt={tier.name}
            className={`w-full h-full object-contain ${isBelow ? 'grayscale' : ''}`}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <tier.Icon
            size={64}
            strokeWidth={1.5}
            style={{ color: isCurrent ? '#ffffff' : tier.accent }}
          />
        )}
      </div>

      <h3 className={`text-lg font-bold ${isCurrent ? 'text-white' : 'text-[#0B2143]'}`}>
        {tier.name}
      </h3>
      <p className={`text-xs font-semibold uppercase tracking-widest mt-0.5 ${isCurrent ? 'text-white/70' : 'text-slate-500'}`}>
        {tier.tagline}
      </p>
      <p className={`text-xs mt-3 leading-relaxed flex-1 ${isCurrent ? 'text-white/80' : 'text-slate-600'}`}>
        {tier.blurb}
      </p>

      <div className="mt-4">
        {isCurrent && (
          <div className="text-center py-2 px-3 rounded-lg bg-white/10 backdrop-blur border border-white/15">
            <p className="text-[11px] text-white font-semibold uppercase tracking-widest">Your active package</p>
          </div>
        )}
        {isBelow && (
          <div className="text-center py-2 px-3 rounded-lg bg-slate-100 border border-slate-200">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest">You've upgraded past this</p>
          </div>
        )}
        {isAbove && !isDominate && (
          <StardustButton size="sm" onClick={onUpgrade} className="w-full">
            Upgrade to {tier.name}
          </StardustButton>
        )}
        {isAbove && isDominate && (
          <div className="space-y-2">
            <StardustButton size="sm" onClick={onGet} className="w-full">
              Get Package
            </StardustButton>
            <button
              onClick={onEnquire}
              className="w-full inline-flex items-center justify-center rounded-full border border-slate-200 hover:border-slate-300 text-[#0B2143] px-3 py-2 text-xs font-semibold transition"
            >
              Enquire
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const WA_NUMBER = '27768038987';

function tierStateFor(tier, currentPackage) {
  const cp = String(currentPackage || '').toLowerCase().trim();
  if (!cp) return 'above';
  if (tier.code === cp) return 'current';
  const currentIdx = TIER_ORDER.indexOf(cp);
  const tierIdx    = TIER_ORDER.indexOf(tier.code);
  if (currentIdx >= 0 && tierIdx < currentIdx) return 'below';
  return 'above';
}

function TierShowcase({ currentPackage, onNavigate }) {
  const onUpgrade  = (code) => onNavigate(`/client/products?buy=${code}`);
  const onGet      = (code) => onNavigate(`/client/products?buy=${code}`);
  const onEnquire  = (code) => {
    const tier = TIERS.find(t => t.code === code);
    const msg = `Hi Marketing iO, I'd like to enquire about the ${tier?.name || 'package'}.`;
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="relative overflow-hidden bg-white/95 rounded-2xl border border-slate-200 shadow-sm animate-fade-in-up">
      <div className="absolute -top-16 -right-16 w-52 h-52 bg-purple-200/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-rose-200/25 rounded-full blur-3xl pointer-events-none" />
      <div className="relative p-6 sm:p-8">
        <div className="mb-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#E2293B] uppercase mb-1">Your packages</p>
          <h2 className="text-xl sm:text-2xl font-bold text-[#0B2143]">Choose your growth stage</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TIERS.map(tier => (
            <TierCard
              key={tier.code}
              tier={tier}
              state={tierStateFor(tier, currentPackage)}
              onUpgrade={() => onUpgrade(tier.code)}
              onGet={() => onGet(tier.code)}
              onEnquire={() => onEnquire(tier.code)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

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

  // Subscription RPC is the authoritative source for the package name.
  // The dashboard RPC only surfaces deal.package when the deal is
  // closed_won; clients like SHOE FIT can be on a package via the
  // subscription record without the deal row being at that stage.
  const subQ = useQuery({
    queryKey: ['my-subscription'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_subscription');
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
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

  // Resolve the client's package from any source that has it.
  // The RPC often returns 'none' until a client is fully "activated",
  // but if they've paid a setup fee for a tier, the invoice line
  // description is the truth. We walk a priority chain and take the
  // first source that yields a real tier code.
  const NULL_PACKAGE = new Set(['', 'none', 'null', 'undefined', 'n/a', 'tbd']);

  // Look at paid setup-fee invoices — description like "Setup fee — accelerate".
  const inferTierFromInvoices = (list) => {
    if (!Array.isArray(list)) return null;
    for (const inv of list) {
      const status = String(inv.status || '').toLowerCase();
      const type   = String(inv.invoice_type || '').toLowerCase();
      const desc   = String(inv.description || '').toLowerCase();
      const isSetup = type === 'setup_fee' || /setup/i.test(desc);
      if (status !== 'paid' || !isSetup) continue;
      for (const code of TIER_ORDER) {
        if (desc.includes(code)) return code;
      }
    }
    return null;
  };

  const rawSources = [
    subQ.data?.package?.name,
    deal?.package,
    client.current_phase,
    client.package_hint,
    inferTierFromInvoices(d.invoices_list || d.invoices || d.recent_invoices),
  ];
  const currentPackage = rawSources
    .map(v => String(v || '').toLowerCase().trim())
    .find(v => v && !NULL_PACKAGE.has(v)) ?? null;

  const pkgLabel = currentPackage ? (PACKAGE_LABEL[currentPackage] ?? currentPackage) : null;
  const onboardingHref = onboarding?.onboarding_token ? `/onboard/${onboarding.onboarding_token}` : '/client/onboarding';

  const heroCopy = pickHeroCopy({
    hasPackage: !!currentPackage,
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

        {/* 2b. TIER SHOWCASE — three-tier premium panel */}
        <TierShowcase
          currentPackage={currentPackage}
          onNavigate={(path) => navigate(path)}
        />

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

      {/* Fixed time + location — bottom-right, desktop only */}
      <TimeLocationWidget location={client.address || 'Pretoria, Gauteng, South Africa'} />
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

