import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, Package, Receipt, MessageCircle, FileSignature, BarChart3, Settings,
  ArrowRight, CheckCircle2, Circle, Clock, X, Send, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import Mascot from '../../components/Mascot.jsx';
import { ADD_ON_CATALOG } from '../../constants/addOnCatalog.js';
import { PORTAL_FAQ } from '../../constants/portalFaq.js';
import EnquiryModal from '../../components/client/EnquiryModal.jsx';

const LOGO_URL = 'https://yyrzppuntgtvurnnksfc.supabase.co/storage/v1/object/public/brand-assets/logo_email.png';
const WHATSAPP_URL = 'https://wa.me/27768038987';
const PACKAGE_LABEL = { ignite: 'Ignite', accelerate: 'Accelerate', dominate: 'Dominate', add_on: 'Add-on', custom: 'Custom' };
const PACKAGE_ORDER = ['ignite', 'accelerate', 'dominate'];
const UPGRADE_FEATURES = {
  ignite: ['Social media management', 'Monthly content calendar', 'Community engagement', 'Monthly report'],
  accelerate: ['Everything in Ignite', 'Paid ad campaigns', 'Landing pages', 'Bi-weekly strategy'],
  dominate: ['Everything in Accelerate', 'Full-funnel strategy', 'Priority support', 'Dedicated specialist'],
};

const fmtZar = (n) => `R ${Number(n ?? 0).toLocaleString('en-ZA')}`;
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

export default function Portal() {
  const [splashDone, setSplashDone] = useState(() => sessionStorage.getItem('mio_splash_seen') === '1');
  const [enquiry, setEnquiry] = useState(null); // { code, name }

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
  const pkgLabel = PACKAGE_LABEL[deal?.package] ?? deal?.package;
  const deliverables = d.deliverables_list ?? [];
  const contracts = d.contracts_list ?? [];
  const team = d.team ?? [];
  const onboardingHref = onboarding?.onboarding_token ? `/onboard/${onboarding.onboarding_token}` : '/client/onboarding';

  const awaitingApproval = deliverables.filter(x => x.status === 'awaiting_client' || x.status === 'submitted');
  const activeDeliverables = deliverables.filter(x => !['delivered', 'approved', 'cancelled'].includes(x.status));
  const unsignedContracts = contracts.filter(c => c.signing_url && !c.client_signed_at);
  const signedContracts = contracts.filter(c => c.client_signed_at);

  const currentIdx = PACKAGE_ORDER.indexOf(deal?.package);
  const upgradePackages = PACKAGE_ORDER
    .map((code, i) => ({ code, i }))
    .filter(({ i }) => i > currentIdx)
    .map(({ code }) => ({ code, name: PACKAGE_LABEL[code], features: UPGRADE_FEATURES[code] }));

  return (
    <div className="space-y-8">
      {/* 2. HERO */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="p-8 lg:p-10 flex flex-col justify-center">
            <p className="text-xs font-semibold tracking-[0.2em] text-red-500 uppercase mb-3">Welcome back</p>
            <h1 className="text-3xl font-bold text-[#0B2143]">{client.business_name || client.contact_person || 'Welcome'}</h1>
            <p className="text-gray-500 mt-2">Your marketing is in good hands.</p>
            {pkgLabel && (
              <span className="inline-block mt-3 self-start rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold ring-1 ring-blue-200">
                {pkgLabel} Package
              </span>
            )}
          </div>
          <div className="relative bg-gradient-to-br from-rose-50 to-purple-50 flex items-center justify-center p-8 min-h-[180px]">
            {client.logo_url
              ? <img src={client.logo_url} alt="" className="max-h-32 max-w-[70%] object-contain" />
              : <Mascot size={160} />}
          </div>
        </div>
      </section>

      {/* 3. ONBOARDING ALERT */}
      {onboarding && onboarding.triggers_done < 4 && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6">
          <h3 className="text-lg font-bold text-amber-800 mb-3">Complete Your Onboarding ({onboarding.triggers_done} of 4)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <TriggerItem done={onboarding.setup_fee_paid} label="Setup fee paid" />
            <TriggerItem done={onboarding.form_returned} label="Onboarding form completed" />
            <TriggerItem done={onboarding.mandate_signed} label="Debit mandate signed" />
            <TriggerItem done={onboarding.assets_received} label="Brand assets received" />
          </div>
          <Link to={onboardingHref} className="mt-4 inline-block bg-amber-600 text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-amber-700 transition">
            Complete onboarding →
          </Link>
        </section>
      )}

      {/* 4. ACTION REQUIRED */}
      {awaitingApproval.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-bold text-[#0B2143]">Action Required</h2>
            <p className="text-gray-500">Deliverables awaiting your review</p>
          </div>
          <div className="space-y-3">
            {awaitingApproval.map(x => (
              <div key={x.id} className="bg-white rounded-xl border border-red-200 p-4 flex items-center justify-between shadow-sm">
                <div>
                  <h3 className="font-semibold text-[#0B2143]">{x.title}</h3>
                  <p className="text-xs text-gray-400">Due: {formatDate(x.due_date)}</p>
                </div>
                <Link to={`/client/deliverables/${x.id}`} className="bg-red-500 text-white rounded-full px-4 py-2 text-xs font-semibold hover:bg-red-600 transition shrink-0">
                  Review →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. DELIVERABLE TIMELINE */}
      {activeDeliverables.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-2xl font-bold text-[#0B2143]">Active Deliverables</h2>
            <p className="text-gray-500">Track your upcoming milestones</p>
          </div>
          <div className="space-y-3">
            {activeDeliverables.map(x => {
              const progress = x.status === 'in_progress' ? 50 : x.status === 'submitted' ? 75 : x.status === 'approved' ? 90 : 25;
              const days = daysUntil(x.due_date);
              return (
                <div key={x.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-2 gap-3">
                    <h3 className="font-semibold text-[#0B2143]">{x.title}</h3>
                    <StatusBadge status={x.status} />
                  </div>
                  {x.due_date && (
                    <p className="text-xs text-gray-400 mb-3">
                      Due: {formatDate(x.due_date)}{days != null && days >= 0 ? ` · ${days} days` : ''}
                    </p>
                  )}
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 6. CONTRACTS */}
      {unsignedContracts.map(c => (
        <section key={c.id} className="bg-white rounded-2xl border-2 border-red-200 p-6 text-center shadow-sm">
          <h3 className="text-lg font-bold text-[#0B2143]">🖊️ Sign Your Contract</h3>
          <p className="text-gray-500 text-sm mt-2">Your {PACKAGE_LABEL[c.package] ?? c.package} contract is ready for your signature.</p>
          <a href={c.signing_url} target="_blank" rel="noreferrer" className="mt-4 inline-block bg-red-500 text-white rounded-full px-6 py-3 text-sm font-bold hover:bg-red-600 transition">
            Review &amp; Sign →
          </a>
        </section>
      ))}
      {signedContracts.length > 0 && (
        <section className="space-y-3">
          {signedContracts.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between shadow-sm">
              <div>
                <h3 className="font-semibold text-[#0B2143]">Your {PACKAGE_LABEL[c.package] ?? c.package} Contract</h3>
                <p className="text-xs text-emerald-600">Signed {formatDate(c.client_signed_at)}</p>
              </div>
              {c.document_url && (
                <a href={c.document_url} target="_blank" rel="noreferrer" className="text-red-500 text-sm font-semibold hover:underline shrink-0">View contract →</a>
              )}
            </div>
          ))}
        </section>
      )}

      {/* 7. PROJECT JOURNEY */}
      <ProjectJourney phase={onboarding?.current_phase} />

      {/* 8. QUICK STATS */}
      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Active Deliverables" value={d.active_deliverables ?? 0} icon={Package} color="blue" />
        <StatCard label="Outstanding Invoices" value={d.outstanding_invoices ?? 0} icon={Receipt} color="red" />
        <StatCard label="Unread Messages" value={d.unread_count ?? 0} icon={MessageCircle} color="purple" />
      </section>

      {/* 9. YOUR TEAM */}
      {team.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-[#0B2143]">Your Marketing iO Team</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {team.map((m, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-100 to-purple-100 mx-auto mb-3 flex items-center justify-center text-lg font-bold text-[#0B2143]">
                  {m.name?.charAt(0) ?? '?'}
                </div>
                <h3 className="font-semibold text-[#0B2143]">{m.name}</h3>
                <p className="text-xs text-gray-400">{m.role}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 10. PROFILE SNAPSHOT */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-[#0B2143]">Your Profile</h2>
          <Link to="/client/profile" className="text-sm text-red-500 font-semibold hover:underline">Edit →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <ProfileField label="Business" value={client.business_name} />
          <ProfileField label="Contact" value={client.contact_person} />
          <ProfileField label="Phone" value={client.phone} />
          <ProfileField label="Email" value={client.email} />
          <ProfileField label="Address" value={client.address || 'Not set'} />
          <ProfileField label="Industry" value={client.industry || 'Not set'} />
        </div>
      </section>

      {/* 11. QUICK LINKS */}
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { to: '/client/invoices', icon: Receipt, label: 'Invoices', desc: 'View & pay' },
          { to: '/client/deliverables', icon: Package, label: 'Deliverables', desc: 'Track progress' },
          { to: '/client/contracts', icon: FileSignature, label: 'Contracts', desc: 'View & sign' },
          { to: '/client/reports', icon: BarChart3, label: 'Reports', desc: 'Monthly stats' },
          { to: '/client/messages', icon: MessageCircle, label: 'Messages', desc: 'Chat with us' },
          { to: '/client/profile', icon: Settings, label: 'Profile', desc: 'Your details' },
        ].map(link => (
          <Link key={link.to} to={link.to} className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm hover:shadow-md transition hover:border-red-200">
            <link.icon size={24} className="mx-auto mb-2 text-[#0B2143]" />
            <h3 className="font-semibold text-sm text-[#0B2143]">{link.label}</h3>
            <p className="text-xs text-gray-400">{link.desc}</p>
          </Link>
        ))}
      </section>

      {/* 12. SALES FLOOR — Upgrade */}
      {deal?.package !== 'dominate' && upgradePackages.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-[#0B2143]">{!deal?.package ? 'Get Started' : 'Take It To The Next Level'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upgradePackages.map((pkg, i) => (
              <div key={pkg.code} className={`bg-white rounded-2xl border p-6 shadow-sm ${i === 0 ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-100'}`}>
                {i === 0 && <span className="inline-block mb-2 rounded-full bg-red-50 text-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-red-200">Recommended</span>}
                <h3 className="text-lg font-bold text-[#0B2143]">{pkg.name}</h3>
                <ul className="mt-3 space-y-1.5">
                  {pkg.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle2 size={14} className="mt-0.5 text-emerald-500 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => setEnquiry({ code: pkg.code, name: `${pkg.name} Package` })}
                        className="mt-4 w-full bg-red-500 text-white rounded-full py-2 text-sm font-semibold hover:bg-red-600 transition">
                  {deal?.package ? 'Upgrade →' : 'Enquire →'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 13. ADD-ONS */}
      <section className="space-y-3">
        <div>
          <h2 className="text-2xl font-bold text-[#0B2143]">Power Up With Add-Ons</h2>
          <p className="text-gray-500">Boost your marketing with individual services</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ADD_ON_CATALOG.filter(a => a.code !== 'custom').map(addon => (
            <div key={addon.code} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex flex-col">
              <h3 className="font-semibold text-[#0B2143]">{addon.name}</h3>
              <p className="text-sm text-gray-500 mt-1 flex-1">
                {addon.setup > 0 ? `${fmtZar(addon.setup)} setup` : ''}
                {addon.setup > 0 && addon.monthly > 0 ? ' + ' : ''}
                {addon.monthly > 0 ? `${fmtZar(addon.monthly)}/mo` : ''}
                {addon.type === 'once_off' ? ' once-off' : ''}
                {addon.note ? ` · ${addon.note}` : ''}
              </p>
              <button onClick={() => setEnquiry({ code: addon.code, name: addon.name })}
                      className="mt-3 w-full bg-red-500 text-white rounded-full py-2 text-sm font-semibold hover:bg-red-600 transition">
                Enquire →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 14. FAQ */}
      <section className="space-y-3">
        <h2 className="text-2xl font-bold text-[#0B2143]">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {PORTAL_FAQ.map(cat => (
            <div key={cat.category}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{cat.category}</h3>
              <div className="space-y-2">
                {cat.items.map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 15. CUSTOM PACKAGES CTA */}
      <section className="bg-white rounded-2xl border border-gray-100 p-8 text-center shadow-sm">
        <h3 className="text-2xl font-bold text-[#0B2143]">Need Something Custom?</h3>
        <p className="text-gray-500 mt-2 max-w-lg mx-auto">
          Every business is unique. If our standard packages don't quite fit, let's design something that does.
        </p>
        <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="mt-4 inline-block bg-red-500 text-white rounded-full px-6 py-3 text-sm font-bold hover:bg-red-600 transition">
          Chat with the founder →
        </a>
      </section>

      {/* 17. FOOTER */}
      <footer className="text-center pt-8 border-t border-gray-200 mt-12 pb-8">
        <p className="text-sm text-gray-400">
          Marketing iO (Pty) Ltd · 2026/303502/07 · 75 Marshall Street, Polokwane 0699
        </p>
        <p className="text-xs text-gray-300 mt-1">
          <a href="mailto:info@marketingio.co.za" className="text-red-500 hover:underline">info@marketingio.co.za</a>
          {' · '}<Link to="/terms" className="hover:underline">Terms</Link>
          {' · '}<Link to="/privacy" className="hover:underline">Privacy</Link>
        </p>
      </footer>

      {/* 16. ENQUIRY MODAL */}
      {enquiry && <EnquiryModal product={enquiry} onClose={() => setEnquiry(null)} />}
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SplashScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50">
      <img src={LOGO_URL} alt="Marketing iO" className="h-16 mb-4 object-contain" />
      <p className="text-sm text-red-500 font-semibold tracking-[0.2em] uppercase">Too good to stay hidden</p>
      <Loader2 className="mt-6 animate-spin text-gray-300" size={24} />
    </div>
  );
}

function TriggerItem({ done, label }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> : <Circle size={16} className="text-amber-400 shrink-0" />}
      <span className={done ? 'text-emerald-700' : 'text-amber-800'}>{label}</span>
    </div>
  );
}

const STATUS_TONE = {
  in_progress: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  submitted: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  awaiting_client: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  delivered: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  changes_requested: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
};
function StatusBadge({ status }) {
  const cls = STATUS_TONE[status] ?? 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{(status ?? '').replace(/_/g, ' ')}</span>;
}

function StatCard({ label, value, icon: Icon, color }) {
  const map = {
    blue: 'border-blue-100 text-blue-600',
    red: 'border-red-100 text-red-600',
    purple: 'border-purple-100 text-purple-600',
  }[color] || 'border-gray-100 text-gray-600';
  return (
    <div className={`bg-white rounded-xl border ${map.split(' ')[0]} p-4 shadow-sm text-center`}>
      <Icon size={20} className={`mx-auto mb-1 ${map.split(' ')[1]}`} />
      <p className="text-3xl font-bold text-[#0B2143]">{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function ProfileField({ label, value }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-[#0B2143] mt-0.5">{value || '—'}</p>
    </div>
  );
}

const JOURNEY_STEPS = [
  { key: 'phase_1_contract', label: 'Onboarding' },
  { key: 'phase_2_setup', label: 'Setup' },
  { key: 'go_live', label: 'Go Live' },
  { key: 'complete', label: 'Running' },
];
function ProjectJourney({ phase }) {
  let activeIdx = JOURNEY_STEPS.findIndex(s => s.key === phase);
  if (activeIdx < 0) activeIdx = 0;
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-[#0B2143] mb-5">Your Project Journey</h2>
      <div className="flex items-center">
        {JOURNEY_STEPS.map((step, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div key={step.key} className="flex-1 flex flex-col items-center relative">
              {i > 0 && <div className={`absolute top-4 right-1/2 w-full h-0.5 ${i <= activeIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
              <div className={`relative z-10 h-8 w-8 rounded-full flex items-center justify-center text-xs ${
                done ? 'bg-emerald-500 text-white' : active ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-200 text-gray-400'
              }`}>
                {done ? <CheckCircle2 size={16} /> : active ? <Clock size={15} /> : i + 1}
              </div>
              <span className={`mt-2 text-[11px] text-center ${active ? 'text-[#0B2143] font-semibold' : 'text-gray-400'}`}>{step.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="text-sm font-medium text-[#0B2143]">{q}</span>
        <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="px-4 pb-4 text-sm text-gray-600">{a}</p>}
    </div>
  );
}

