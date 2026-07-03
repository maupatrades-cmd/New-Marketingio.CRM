import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, CheckCircle2, XCircle, ChevronLeft, Send, Save,
  AlertTriangle, Clock, Rocket,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase.js';

const TRIGGERS = [
  { key: 'setup_fee_paid',              label: 'Setup fee paid',      auto: false },
  { key: 'onboarding_form_returned',    label: 'Form returned',       auto: true },
  { key: 'debit_mandate_signed',        label: 'Debit mandate signed', auto: false },
  { key: 'brand_assets_received',       label: 'Brand assets received', auto: false },
];

export default function OnboardingSubmissions() {
  const [selectedId, setSelectedId] = useState(null);

  return selectedId
    ? <DetailView id={selectedId} onBack={() => setSelectedId(null)} />
    : <ListView onSelect={setSelectedId} />;
}

function ListView({ onSelect }) {
  const listQ = useQuery({
    queryKey: ['onboarding-forms', 'returned'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_onboarding_forms_list', { p_filter: 'returned' });
      if (error) throw error;
      return data ?? [];
    },
  });

  const allQ = useQuery({
    queryKey: ['onboarding-forms', 'all-submissions'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_onboarding_forms_list', { p_filter: 'all' });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = allQ.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-gradient">Onboarding Submissions</h1>
        <p className="text-sm text-soft mt-1">Review client submissions and manage the four onboarding triggers.</p>
      </div>

      {allQ.isLoading && (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-soft" /></div>
      )}

      {rows.length === 0 && !allQ.isLoading && (
        <p className="text-center text-sm text-soft py-12">No onboarding submissions yet.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-darkbg-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-darkbg-border bg-darkbg-800/50 text-left text-xs uppercase tracking-wider text-soft">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Form</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}
                    onClick={() => onSelect(r.id)}
                    className="border-b border-darkbg-border/50 hover:bg-darkbg-800/30 cursor-pointer">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{r.client_name}</p>
                    {r.package && (
                      <span className="inline-block mt-0.5 rounded-full border border-blue-400/40 bg-blue-400/10 px-2 py-0.5 text-[10px] text-blue-300 uppercase">
                        {r.package.replace(/_/g, ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.form_returned
                      ? <span className="text-emerald-400 text-xs"><CheckCircle2 size={12} className="inline mr-1" />Returned</span>
                      : <span className="text-amber-400 text-xs"><Clock size={12} className="inline mr-1" />Pending</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${
                      r.overall_status === 'complete'
                        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                        : 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                    }`}>
                      {r.overall_status ?? 'pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-soft">{r.days_waiting}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DetailView({ id, onBack }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(null);
  const [notesDirty, setNotesDirty] = useState(false);

  const detailQ = useQuery({
    queryKey: ['onboarding-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_onboarding_submission_detail', { p_onboarding_id: id });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);
      return data;
    },
    onSuccess: (d) => { if (notes === null) setNotes(d.onboarding?.notes ?? ''); },
  });

  const triggerMut = useMutation({
    mutationFn: async ({ trigger, value }) => {
      const { data, error } = await supabase.rpc('mark_onboarding_trigger', {
        p_onboarding_id: id, p_trigger: trigger, p_value: value,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['onboarding-detail', id] });
      qc.invalidateQueries({ queryKey: ['onboarding-forms'] });
      if (res.all_triggers_complete) toast.success('All triggers complete — GO LIVE task created.');
      else toast.success(`Trigger updated`);
    },
    onError: (err) => toast.error(err.message),
  });

  const notesMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_onboarding_notes', { p_onboarding_id: id, p_notes: notes });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Notes saved'); setNotesDirty(false); },
    onError: (err) => toast.error(err.message),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('send_onboarding_form_link', { p_onboarding_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: (res) => toast.success(`Reminder sent to ${res.emailed_to}`),
    onError: (err) => toast.error(err.message),
  });

  if (detailQ.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-soft" /></div>;
  }
  if (detailQ.isError) {
    return <div className="text-rose-400 text-sm">{detailQ.error?.message}</div>;
  }

  const ob = detailQ.data?.onboarding;
  const c = detailQ.data?.client;
  const deal = detailQ.data?.deal;
  if (!ob || !c) return <p className="text-soft">Not found</p>;

  if (notes === null && ob.notes !== undefined) setNotes(ob.notes ?? '');

  const completeness = {
    basics: !!(c.business_name && c.contact_person && c.phone && c.email),
    logo: !!c.logo_url,
    brand_assets: (c.brand_assets_urls?.length > 0) || !!c.brand_colors,
    discovery: !!(deal?.discovery?.biz_does && deal?.discovery?.ideal_customer && deal?.discovery?.goal),
    accounts: !!(c.google_account_email || c.facebook_page_url || c.instagram_handle),
    content: !!(c.tone_of_voice || c.languages),
    availability: !!c.preferred_call_time,
  };
  const score = Object.values(completeness).filter(Boolean).length;
  const total = Object.keys(completeness).length;

  const triggerCount = [ob.trigger_setup_fee_paid, ob.trigger_onboarding_form_returned, ob.trigger_debit_mandate_signed, ob.trigger_brand_assets_received].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-soft hover:text-white">
        <ChevronLeft size={16} /> Back to list
      </button>

      <div>
        <h1 className="font-display text-2xl text-white">{c.business_name || c.contact_person}</h1>
        {deal?.package && (
          <span className="inline-block mt-1 rounded-full border border-blue-400/40 bg-blue-400/10 px-2 py-0.5 text-xs text-blue-300 uppercase">
            {deal.package.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {/* Four-Trigger Dashboard */}
      <div className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRIGGERS.map(t => {
            const val = ob[`trigger_${t.key}`];
            const dateVal = ob[`trigger_${t.key}_date`];
            return (
              <div key={t.key} className={`rounded-xl border p-3 ${val ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-darkbg-border'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {val ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-rose-400" />}
                  <span className="text-xs font-semibold text-white">{t.label}</span>
                </div>
                <p className="text-[10px] text-soft">
                  {val && dateVal ? new Date(dateVal).toLocaleDateString('en-ZA') : val ? 'Yes' : 'Not yet'}
                </p>
                {!t.auto && (
                  <button
                    onClick={() => triggerMut.mutate({ trigger: t.key, value: !val })}
                    disabled={triggerMut.isPending}
                    className={`mt-2 w-full rounded-lg border px-2 py-1 text-[10px] font-medium transition ${
                      val
                        ? 'border-rose-500/40 text-rose-300 hover:bg-rose-500/10'
                        : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                    }`}>
                    {val ? 'Undo' : 'Mark done'}
                  </button>
                )}
                {t.auto && <p className="mt-2 text-[10px] text-soft italic">Auto-set</p>}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-sm text-soft">{triggerCount} of 4 complete</p>
        {triggerCount === 4 && (
          <p className="mt-1 text-center text-sm text-emerald-400 font-semibold">
            <Rocket size={14} className="inline mr-1" /> GO LIVE task created
          </p>
        )}
      </div>

      {/* Completeness */}
      <div className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-4">
        <p className="text-sm font-semibold text-white mb-2">{score} of {total} sections complete</p>
        <div className="h-2 w-full rounded-full bg-darkbg-700 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-brandred to-emerald-500 transition-all"
               style={{ width: `${(score / total) * 100}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(completeness).map(([k, v]) => (
            <span key={k} className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${
              v ? 'border-emerald-400/40 text-emerald-300' : 'border-amber-400/40 text-amber-300'
            }`}>
              {v ? <CheckCircle2 size={10} className="inline mr-0.5" /> : <AlertTriangle size={10} className="inline mr-0.5" />}
              {k.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Submitted Data Sections */}
      <DataSection title="The Basics">
        <DataRow label="Business name" value={c.business_name} />
        <DataRow label="Industry" value={c.industry} />
        <DataRow label="Contact person" value={c.contact_person} />
        <DataRow label="Email" value={c.email} />
        <DataRow label="Phone" value={c.phone} />
        <DataRow label="WhatsApp" value={c.whatsapp_number} />
        <DataRow label="Website" value={c.website} />
        <DataRow label="Address" value={c.address} />
        <DataRow label="Google Maps" value={c.gmaps_url} link />
        <DataRow label="Socials" value={c.socials ? JSON.stringify(c.socials) : null} />
      </DataSection>

      <DataSection title="Logo">
        {c.logo_url ? (
          <img src={c.logo_url} alt="Logo" className="h-20 w-20 rounded-lg bg-white object-contain p-2" />
        ) : (
          <MissingBadge />
        )}
      </DataSection>

      <DataSection title="Brand Assets">
        <DataRow label="Brand colours" value={c.brand_colors} />
        <DataRow label="Brand fonts" value={c.brand_fonts} />
        {c.brand_assets_urls?.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-2">
            {c.brand_assets_urls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt="" className="h-16 w-16 rounded object-cover bg-white" />
              </a>
            ))}
          </div>
        ) : (
          <MissingBadge label="No files uploaded" />
        )}
      </DataSection>

      <DataSection title="Discovery">
        <DataRow label="What does the business do?" value={deal?.discovery?.biz_does} required />
        <DataRow label="Ideal customers" value={deal?.discovery?.ideal_customer} required />
        <DataRow label="#1 Goal" value={deal?.discovery?.goal} required />
        <DataRow label="Differentiator" value={deal?.discovery?.differentiator} />
        <DataRow label="Brand ready" value={deal?.discovery?.brand_ready} />
        <DataRow label="Location" value={deal?.discovery?.location} />
        <DataRow label="Avoid" value={deal?.discovery?.avoid} />
        <DataRow label="Existing socials" value={deal?.discovery?.socials_existing} />
        <DataRow label="How found" value={deal?.discovery?.how_found} />
        <DataRow label="Competitor" value={deal?.discovery?.competitor} />
        <DataRow label="Busy times" value={deal?.discovery?.busy_times} />
        <DataRow label="Price range" value={deal?.discovery?.price_range} />
        <DataRow label="Business WhatsApp" value={deal?.discovery?.biz_whatsapp} />
      </DataSection>

      <DataSection title="Account Access">
        <DataRow label="Google account email" value={c.google_account_email} />
        <DataRow label="Facebook page" value={c.facebook_page_url} link />
        <DataRow label="Instagram" value={c.instagram_handle} />
        <DataRow label="TikTok" value={c.tiktok_handle} />
      </DataSection>

      <DataSection title="Content Preferences">
        <DataRow label="Tone of voice" value={c.tone_of_voice} />
        <DataRow label="Languages" value={c.languages} />
        <DataRow label="Posting preference" value={c.posting_preference} />
        <DataRow label="Words to avoid" value={c.words_to_avoid} />
      </DataSection>

      <DataSection title="Availability">
        <DataRow label="Preferred call time" value={c.preferred_call_time} />
        <DataRow label="Client notes" value={c.onboarding_notes} />
      </DataSection>

      {/* Admin Notes */}
      <div className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-soft">Admin Notes</p>
        <textarea
          className="input min-h-[80px]"
          value={notes ?? ''}
          onChange={e => { setNotes(e.target.value); setNotesDirty(true); }}
          placeholder="Internal notes about this client's onboarding…"
        />
        <div className="flex gap-2">
          <button onClick={() => notesMut.mutate()} disabled={!notesDirty || notesMut.isPending}
                  className="btn-secondary text-xs">
            {notesMut.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : <Save size={12} className="mr-1" />}
            Save notes
          </button>
          <button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}
                  className="btn-secondary text-xs">
            {sendMut.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : <Send size={12} className="mr-1" />}
            Send reminder
          </button>
        </div>
      </div>
    </div>
  );
}

function DataSection({ title, children }) {
  return (
    <section className="rounded-xl border border-darkbg-border bg-darkbg-800/50 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-soft">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DataRow({ label, value, required, link }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="w-40 shrink-0 text-soft">{label}{required && ' *'}</span>
      {value ? (
        link ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline truncate">{value}</a>
        ) : (
          <span className="text-white whitespace-pre-wrap">{value}</span>
        )
      ) : (
        <MissingBadge label={required ? 'Required — not provided' : 'Not provided'} warn={required} />
      )}
    </div>
  );
}

function MissingBadge({ label = 'Not provided', warn }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
      warn ? 'border-rose-400/40 bg-rose-400/10 text-rose-300' : 'border-amber-400/40 bg-amber-400/10 text-amber-300'
    }`}>
      <AlertTriangle size={10} /> {label}
    </span>
  );
}
