import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Eye, EyeOff, ArrowLeft, ArrowRight,
  Phone, Mail, MessageSquare, Smartphone,
} from 'lucide-react';
import { supabase, supabaseReady } from '../lib/supabase.js';

const LOGO_URL =
  'https://media.base44.com/images/public/69f52863b2b733d922d90b62/ce0ebdea2_marketing_io_main_logo-removebg-preview.png';

const TOTAL_STEPS = 5;

/* ─────────── reference option lists (from old CRM) ─────────── */
const INDUSTRIES = [
  ['retail', 'Retail / Shop'], ['services', 'Services'],
  ['construction', 'Construction / Trades'], ['hospitality', 'Hospitality / Food'],
  ['beauty', 'Beauty / Salon'], ['health', 'Health / Wellness'],
  ['professional', 'Professional Services'], ['education', 'Education / Training'],
  ['other', 'Other'],
];
const YEARS_IN_BUSINESS = [
  ['starting', 'Just starting out'], ['less_than_1', 'Less than 1 year'],
  ['1_to_3', '1 – 3 years'], ['3_to_5', '3 – 5 years'],
  ['5_to_10', '5 – 10 years'], ['10_plus', '10+ years'],
];
const EMPLOYEE_RANGES = [
  ['just_me', 'Just me'], ['2_to_5', '2 – 5'],
  ['6_to_15', '6 – 15'], ['16_to_50', '16 – 50'], ['50_plus', '50+'],
];
const PROVINCES = [
  ['gauteng', 'Gauteng'], ['western_cape', 'Western Cape'],
  ['kwazulu_natal', 'KwaZulu-Natal'], ['eastern_cape', 'Eastern Cape'],
  ['free_state', 'Free State'], ['limpopo', 'Limpopo'],
  ['mpumalanga', 'Mpumalanga'], ['north_west', 'North West'],
  ['northern_cape', 'Northern Cape'],
];
const SIGNUP_ATTRIBUTION_OPTIONS = [
  ['staff_cpc1', 'cpc1'], ['staff_cpc2', 'cpc2'],
  ['staff_field1', 'field1'], ['staff_field2', 'field2'],
  ['staff_admin', 'admin'], ['staff_thapelo', 'Thapelo'],
  ['source_friend', 'Recommended by a friend'],
  ['source_google', 'Google / online search'],
  ['source_social', 'Social media (Facebook / Instagram / TikTok)'],
  ['source_whatsapp', 'WhatsApp message'],
  ['source_flyer', 'Saw a flyer or doorhanger'],
  ['source_walkin', 'Walked into the office'],
  ['source_other', 'Other'], ['self_signup', 'I signed up myself'],
];
const TWELVE_MONTH_GOALS = [
  ['same_steady', 'Stay where I am — steady and stable'],
  ['double_revenue', 'Double my revenue'],
  ['five_x_growth', '5× growth'], ['sell_business', 'Sell the business'],
  ['open_branches', 'Open more branches'],
];
const CHALLENGES = [
  ['not_enough_leads', "I'm not getting enough leads"],
  ['customers_dont_return', "Customers don't come back"],
  ['cant_compete', "I can't compete with bigger players"],
  ['dont_know_marketing', "I don't know where to start with marketing"],
  ['too_busy_doing_work', "I'm too busy doing the work to market"],
  ['bad_reputation', "My online reputation is hurting me"],
  ['all_above', 'All of the above'],
];
const REVENUE_RANGES = [
  ['under_20k', 'Under R20,000'], ['20k_to_50k', 'R20,000 – R50,000'],
  ['50k_to_150k', 'R50,000 – R150,000'],
  ['150k_to_500k', 'R150,000 – R500,000'], ['500k_plus', 'R500,000+'],
];
const NEW_CUSTOMER_TARGETS = [
  ['5_to_10', '5 – 10 new customers'], ['10_to_25', '10 – 25'],
  ['25_to_50', '25 – 50'], ['50_to_100', '50 – 100'], ['100_plus', '100+'],
];
const URGENCY_LEVELS = [
  ['yesterday', 'I needed it yesterday'],
  ['within_1_month', 'Within 1 month'],
  ['within_3_months', 'Within 3 months'],
  ['planning_ahead', "I'm planning ahead"], ['no_rush', 'No rush — just looking'],
];
const MARKETING_ASSETS = [
  ['website', 'A working website'],
  ['whatsapp_automation', 'WhatsApp automation / Business app'],
  ['active_social', 'Active social media (posting weekly)'],
  ['gmb_claimed', 'Claimed Google Business Profile'],
  ['paid_ads', 'Running paid ads'],
  ['email_marketing', 'Email newsletter / marketing'],
  ['crm', 'A CRM tracking my customers'],
];
const AGENCY_HISTORY_OPTS = [
  ['yes_didnt_work', "Yes — but it didn't work"],
  ['yes_too_expensive', 'Yes — but too expensive'],
  ['never', 'Never used one'], ['tried_diy', 'Tried to DIY'],
];
const BUDGET_RANGES = [
  ['under_500', 'Under R500'], ['500_to_1500', 'R500 – R1,500'],
  ['1500_to_3000', 'R1,500 – R3,000'],
  ['3000_to_7000', 'R3,000 – R7,000'], ['7000_plus', 'R7,000+'],
];
const CONTACT_CHANNELS = [
  ['phone', 'Phone call', Phone], ['whatsapp', 'WhatsApp', MessageSquare],
  ['email', 'Email', Mail], ['sms', 'SMS', Smartphone],
];
const CALL_TIMES = [
  ['morning', 'Morning (08:00 – 12:00)'], ['lunch', 'Lunch (12:00 – 14:00)'],
  ['afternoon', 'Afternoon (14:00 – 17:00)'],
  ['evening', 'Evening (17:00 – 20:00)'], ['weekend_only', 'Weekends only'],
];

/* ─────────── helpers ─────────── */
function makeCaptcha() {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  return { a, b, answer: a + b };
}
function isValidSAMobile(v) {
  const s = (v || '').replace(/\s+/g, '');
  return /^0\d{9}$/.test(s) || /^\+27\d{9}$/.test(s);
}

/* ─────────── presentational primitives ─────────── */
function ProgressBar({ step }) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between text-xs text-navy-900/60">
        <span>Step {step} of {TOTAL_STEPS}</span>
        <span>{pct}% complete</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-navy-900/10">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${pct}%`, background: 'linear-gradient(135deg, #e63946 0%, #ff2e97 100%)' }}
        />
      </div>
    </div>
  );
}
function Field({ label, required, children }) {
  return (
    <div>
      <label className="label-light">{label}{required && ' *'}</label>
      {children}
    </div>
  );
}
function Select({ label, value, onChange, options, required }) {
  return (
    <Field label={label} required={required}>
      <select value={value || ''} onChange={onChange} required={required} className="input-light">
        <option value="">Choose…</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
}
function Text({ label, type = 'text', value, onChange, required, placeholder, autoComplete }) {
  return (
    <Field label={label} required={required}>
      <input
        type={type} value={value || ''} onChange={onChange}
        required={required} placeholder={placeholder} autoComplete={autoComplete}
        className="input-light"
      />
    </Field>
  );
}
function Area({ label, value, onChange, placeholder, maxLength = 500 }) {
  return (
    <Field label={label}>
      <textarea
        value={value || ''} onChange={onChange} placeholder={placeholder}
        maxLength={maxLength} rows={3}
        className="input-light resize-none"
      />
      <p className="mt-1 text-right text-[10px] text-navy-900/50">
        {(value || '').length}/{maxLength}
      </p>
    </Field>
  );
}
function CheckboxGrid({ label, values = [], options, onToggle }) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((opt) => {
          const [v, l, Icon] = opt;
          const checked = values.includes(v);
          return (
            <label
              key={v}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                checked
                  ? 'border-brandred bg-brandred/10 text-navy-ink'
                  : 'border-navy-900/15 bg-white text-navy-ink/80 hover:border-navy-900/30'
              }`}
            >
              <input
                type="checkbox" checked={checked} onChange={() => onToggle(v)}
                className="accent-brandred"
              />
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span className="flex-1">{l}</span>
            </label>
          );
        })}
      </div>
    </Field>
  );
}

/* ─────────── main ─────────── */
export default function SignUp() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const captcha = useMemo(makeCaptcha, []);
  const [captchaInput, setCaptchaInput] = useState('');

  const [form, setForm] = useState({
    // Step 1
    first_name: '', last_name: '', email: '', mobile_number: '',
    city: '', street_address: '', province: '', signed_up_by: '',
    password: '', confirmPassword: '', agreed: false,
    // Step 2
    business_name: '', industry: '', years_in_business: '',
    number_of_employees: '', business_city: '', business_address: '', business_province: '',
    // Step 3
    twelve_month_goal: '', biggest_challenge: '',
    founder_inspiration: '', competitor_envy: '',
    // Step 4
    monthly_revenue_range: '', new_customers_target: '', urgency_level: '',
    current_marketing_assets: [], agency_history: '',
    // Step 5
    monthly_marketing_budget: '', preferred_contact_channels: [],
    best_call_time: '', wants_consultation_call: false,
    wants_personalized_proposal: false, popia_consent: false,
  });

  const set = (field) => (e) => setForm((f) => ({
    ...f,
    [field]: e?.target?.type === 'checkbox' ? e.target.checked : (e?.target ? e.target.value : e),
  }));
  const toggleArray = (field, value) => setForm((f) => ({
    ...f,
    [field]: f[field].includes(value) ? f[field].filter((v) => v !== value) : [...f[field], value],
  }));

  /* Step 1: validate locally; do NOT call supabase yet — auth happens on final submit. */
  function nextFromStep1(e) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return toast.error('First and last name are required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return toast.error('Enter a valid email address.');
    if (!isValidSAMobile(form.mobile_number)) return toast.error('Mobile must be SA format: 0XXXXXXXXX or +27XXXXXXXXX.');
    if (!form.city.trim()) return toast.error('City is required.');
    if (!form.street_address.trim()) return toast.error('Street address is required.');
    if (!form.province) return toast.error('Pick your province.');
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters.');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match.');
    if (Number(captchaInput) !== captcha.answer) return toast.error('Security check failed.');
    if (!form.agreed) return toast.error('Agree to the Terms of Service to continue.');
    setStep(2);
  }

  function nextFromStep2(e) {
    e.preventDefault();
    if (!form.business_name.trim()) return toast.error('Business name is required.');
    if (!form.industry) return toast.error('Pick an industry.');
    if (!form.years_in_business) return toast.error("Pick how long you've been in business.");
    if (!form.number_of_employees) return toast.error('Pick a team size.');
    if (!form.business_city.trim()) return toast.error('Business city is required.');
    if (!form.business_province) return toast.error('Pick a province.');
    setStep(3);
  }

  /* Steps 3 & 4 are optional — Skip just advances. */
  const advance = (n) => () => setStep(n);

  /* Final submit: create supabase auth user → call submit_signup RPC. */
  async function finalSubmit(skip = false) {
    if (!skip && !form.popia_consent) {
      return toast.error('Please tick the consent box. You can opt out anytime.');
    }
    if (!supabaseReady) {
      return toast.error('Supabase env vars not set on this deployment.');
    }
    setLoading(true);
    const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();

    const { error: signupError } = await supabase.auth.signUp({
      email: form.email.toLowerCase().trim(),
      password: form.password,
      options: {
        data: { full_name: fullName, mobile_number: form.mobile_number.replace(/\s+/g, '') },
      },
    });
    if (signupError) {
      setLoading(false);
      return toast.error(signupError.message);
    }

    // Sign in immediately so we have a session for the RPC.
    const { error: siError } = await supabase.auth.signInWithPassword({
      email: form.email.toLowerCase().trim(),
      password: form.password,
    });
    if (siError) {
      setLoading(false);
      toast.success('Account created. Check your inbox to confirm, then sign in.');
      return navigate('/login', { replace: true });
    }

    // Persist client + signup_data atomically.
    const payload = {
      full_name: fullName,
      email: form.email.toLowerCase().trim(),
      mobile_number: form.mobile_number.replace(/\s+/g, ''),
      city: form.city.trim(),
      street_address: form.street_address.trim(),
      province: form.province,
      business_name: form.business_name.trim(),
      industry: form.industry,
      popia_consent: !!form.popia_consent,
      completed_steps: skip ? 4 : 5,
      signup_data: {
        signed_up_by: form.signed_up_by,
        years_in_business: form.years_in_business,
        number_of_employees: form.number_of_employees,
        business_city: form.business_city.trim(),
        business_address: form.business_address.trim(),
        business_province: form.business_province,
        twelve_month_goal: form.twelve_month_goal,
        biggest_challenge: form.biggest_challenge,
        founder_inspiration: form.founder_inspiration.trim(),
        competitor_envy: form.competitor_envy.trim(),
        monthly_revenue_range: form.monthly_revenue_range,
        new_customers_target: form.new_customers_target,
        urgency_level: form.urgency_level,
        current_marketing_assets: form.current_marketing_assets,
        agency_history: form.agency_history,
        monthly_marketing_budget: form.monthly_marketing_budget,
        preferred_contact_channels: form.preferred_contact_channels,
        best_call_time: form.best_call_time,
        wants_consultation_call: !!form.wants_consultation_call,
        wants_personalized_proposal: !!form.wants_personalized_proposal,
      },
    };
    const { error: rpcErr } = await supabase.rpc('submit_signup', { payload });
    setLoading(false);
    if (rpcErr) return toast.error(rpcErr.message);
    toast.success('Welcome aboard.');
    navigate('/owner', { replace: true });
  }

  const Back = ({ to }) => (
    <button
      type="button" onClick={() => setStep(to)} disabled={loading}
      className="flex items-center gap-1.5 text-sm text-navy-900/70 hover:text-navy-ink"
    >
      <ArrowLeft className="h-4 w-4" /> Back
    </button>
  );
  const Skip = ({ onClick }) => (
    <button
      type="button" onClick={onClick} disabled={loading}
      className="text-xs text-navy-900/60 underline underline-offset-2 hover:text-navy-ink"
    >
      Skip — we'll learn more on a quick call
    </button>
  );
  const PrimaryBtn = ({ children, onClick, type = 'button' }) => (
    <button
      type={type} onClick={onClick} disabled={loading}
      className="flex items-center justify-center gap-2 rounded-lg py-3 px-6 text-sm font-semibold text-white transition disabled:opacity-60"
      style={{ background: 'linear-gradient(135deg, #e63946 0%, #ff2e97 100%)' }}
    >
      {loading ? 'Saving…' : <>{children} <ArrowRight className="h-4 w-4" /></>}
    </button>
  );

  return (
    <div className="min-h-screen bg-auth">
      {!supabaseReady && (
        <div className="bg-brandred px-4 py-2 text-center text-sm text-white">
          Supabase env vars missing — set them in Vercel, then redeploy.
        </div>
      )}

      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center px-4 py-10">
        <img src={LOGO_URL} alt="Marketing iO" className="mb-4 h-20 w-auto max-w-[360px] object-contain sm:h-24" />
        <h1 className="font-display text-2xl font-bold text-navy-ink">Create your account</h1>
        <p className="mt-1 text-sm text-navy-900/60">
          Tell us about your business — even small answers help us help you.
        </p>

        <div className="card-light mt-6 w-full p-6 sm:p-7">
          <ProgressBar step={step} />

          {/* ─────────── STEP 1 — Your account ─────────── */}
          {step === 1 && (
            <form onSubmit={nextFromStep1} className="space-y-4">
              <h2 className="text-lg font-semibold text-navy-ink">Your account</h2>

              <div className="grid grid-cols-2 gap-3">
                <Text label="First name" required value={form.first_name} onChange={set('first_name')} placeholder="Jane" autoComplete="given-name"/>
                <Text label="Last name" required value={form.last_name} onChange={set('last_name')} placeholder="Smith" autoComplete="family-name"/>
              </div>

              <Text label="Email address" type="email" required value={form.email} onChange={set('email')} placeholder="you@business.co.za" autoComplete="email"/>

              <Text label="Mobile (SA: 0XXXXXXXXX or +27XXXXXXXXX)" type="tel" required value={form.mobile_number} onChange={set('mobile_number')} placeholder="082 123 4567" autoComplete="tel"/>

              <Field label="Who signed you up? (optional)">
                <select value={form.signed_up_by} onChange={set('signed_up_by')} className="input-light">
                  <option value="">— Select if applicable —</option>
                  {SIGNUP_ATTRIBUTION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>

              <Text label="City" required value={form.city} onChange={set('city')} placeholder="Johannesburg" autoComplete="address-level2"/>
              <Text label="Street address" required value={form.street_address} onChange={set('street_address')} placeholder="75 Marshall Street" autoComplete="street-address"/>
              <Select label="Province" required value={form.province} onChange={set('province')} options={PROVINCES} />

              <Field label="Password" required>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')}
                    required autoComplete="new-password" minLength={8}
                    className="input-light pr-12"
                    placeholder="Minimum 8 characters"
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-navy-900/60 hover:bg-navy-900/5">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>

              <Text label="Confirm password" type="password" required value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="Repeat password" autoComplete="new-password"/>

              <Text label={`Security check: ${captcha.a} + ${captcha.b} = ?`} type="number" required
                    value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} placeholder="Answer"/>

              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={form.agreed} onChange={set('agreed')} className="mt-0.5 accent-brandred"/>
                <span className="text-xs text-navy-900/70">
                  I agree to Marketing iO's{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brandred hover:underline">Terms of Service</a>
                </span>
              </label>

              <button type="submit" disabled={loading} className="btn-navy">
                {loading ? 'Creating account…' : 'Continue'}
              </button>

              <p className="text-center text-sm text-navy-900/70">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-brandred hover:underline">Sign in</Link>
              </p>
            </form>
          )}

          {/* ─────────── STEP 2 — Your business ─────────── */}
          {step === 2 && (
            <form onSubmit={nextFromStep2} className="space-y-4">
              <h2 className="text-lg font-semibold text-navy-ink">Your business</h2>
              <p className="-mt-2 text-xs text-navy-900/60">Helps us tailor the pitch.</p>

              <Text label="Business name" required value={form.business_name} onChange={set('business_name')} placeholder="Acme Trading (Pty) Ltd"/>
              <Select label="Industry" required value={form.industry} onChange={set('industry')} options={INDUSTRIES}/>

              <div className="grid grid-cols-2 gap-3">
                <Select label="Years in business" required value={form.years_in_business} onChange={set('years_in_business')} options={YEARS_IN_BUSINESS}/>
                <Select label="Team size" required value={form.number_of_employees} onChange={set('number_of_employees')} options={EMPLOYEE_RANGES}/>
              </div>

              <Text label="City" required value={form.business_city} onChange={set('business_city')} placeholder="Polokwane"/>
              <Text label="Full address" value={form.business_address} onChange={set('business_address')} placeholder="75 Marshall Street"/>
              <Select label="Province" required value={form.business_province} onChange={set('business_province')} options={PROVINCES}/>

              <div className="flex items-center justify-between gap-4 pt-2">
                <Back to={1} />
                <button type="submit" disabled={loading} className="btn-navy flex-1">
                  {loading ? 'Saving…' : 'Continue'}
                </button>
              </div>
            </form>
          )}

          {/* ─────────── STEP 3 — Your story ─────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-navy-ink">Your story</h2>
              <p className="-mt-2 text-xs text-navy-900/60">
                Help us understand your vision — skip if you'd rather we call you.
              </p>

              <Select label="Where do you want your business in 12 months?" value={form.twelve_month_goal} onChange={set('twelve_month_goal')} options={TWELVE_MONTH_GOALS}/>
              <Select label="What's your BIGGEST challenge right now?" value={form.biggest_challenge} onChange={set('biggest_challenge')} options={CHALLENGES}/>
              <Area label="What inspired you to start this business?" value={form.founder_inspiration} onChange={set('founder_inspiration')} placeholder="Optional — your why."/>
              <Area label="What's your competitor doing that you wish you were?" value={form.competitor_envy} onChange={set('competitor_envy')} placeholder="Optional — be honest."/>

              <div className="flex items-center justify-between gap-4 pt-2">
                <Back to={2} />
                <Skip onClick={advance(4)} />
                <PrimaryBtn onClick={advance(4)}>Continue</PrimaryBtn>
              </div>
            </div>
          )}

          {/* ─────────── STEP 4 — Where you are now ─────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-navy-ink">Where you are now</h2>
              <p className="-mt-2 text-xs text-navy-900/60">
                Help us tailor the pitch — skip and we'll ask on a call.
              </p>

              <Select label="Current monthly revenue range" value={form.monthly_revenue_range} onChange={set('monthly_revenue_range')} options={REVENUE_RANGES}/>
              <Select label="How many NEW customers per month would change your life?" value={form.new_customers_target} onChange={set('new_customers_target')} options={NEW_CUSTOMER_TARGETS}/>
              <Select label="How urgently do you need results?" value={form.urgency_level} onChange={set('urgency_level')} options={URGENCY_LEVELS}/>

              <CheckboxGrid label="Do you currently have:" values={form.current_marketing_assets}
                            options={MARKETING_ASSETS}
                            onToggle={(v) => toggleArray('current_marketing_assets', v)}/>
              <Select label="Have you worked with an agency before?" value={form.agency_history} onChange={set('agency_history')} options={AGENCY_HISTORY_OPTS}/>

              <div className="flex items-center justify-between gap-4 pt-2">
                <Back to={3} />
                <Skip onClick={advance(5)} />
                <PrimaryBtn onClick={advance(5)}>Continue</PrimaryBtn>
              </div>
            </div>
          )}

          {/* ─────────── STEP 5 — How to reach you ─────────── */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-navy-ink">How to reach you</h2>
              <p className="-mt-2 text-xs text-navy-900/60">Last step — how should we follow up?</p>

              <Select label="If you were to invest in marketing, what monthly budget feels right?" value={form.monthly_marketing_budget} onChange={set('monthly_marketing_budget')} options={BUDGET_RANGES}/>
              <CheckboxGrid label="How can we reach you?" values={form.preferred_contact_channels} options={CONTACT_CHANNELS} onToggle={(v) => toggleArray('preferred_contact_channels', v)}/>
              <Select label="Best time to call?" value={form.best_call_time} onChange={set('best_call_time')} options={CALL_TIMES}/>

              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={form.wants_consultation_call} onChange={set('wants_consultation_call')} className="mt-0.5 accent-brandred"/>
                  <span className="text-sm text-navy-ink">I want a free 15-min consultation call</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={form.wants_personalized_proposal} onChange={set('wants_personalized_proposal')} className="mt-0.5 accent-brandred"/>
                  <span className="text-sm text-navy-ink">Send me a personalized proposal</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 border-t border-navy-900/10 pt-2">
                  <input type="checkbox" checked={form.popia_consent} onChange={set('popia_consent')} className="mt-1 accent-brandred"/>
                  <span className="text-xs text-navy-900/70">
                    <strong>Required:</strong> I agree to receive communication from Marketing iO. POPIA-compliant. Opt out anytime.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2">
                <Back to={4} />
                <Skip onClick={() => finalSubmit(true)} />
                <PrimaryBtn onClick={() => finalSubmit(false)}>
                  {loading ? 'Submitting' : 'Submit & Verify Email'}
                </PrimaryBtn>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-navy-900/60">
          Need help?{' '}
          <a href="mailto:support@marketingio.co.za" className="text-navy-ink hover:underline">
            support@marketingio.co.za
          </a>
        </p>
      </div>
    </div>
  );
}
