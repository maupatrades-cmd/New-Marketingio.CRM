// /owner/leads/new — staff lead capture form.
// Accessible to: owner, admin, field_agent, cpc.
// RLS restricts what submitted leads are visible to each role.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, X, ChevronLeft } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { useAuth } from '../../../lib/auth.jsx';
import DuplicateConfirmDialog from '../../../components/DuplicateConfirmDialog.jsx';

const PACKAGES = [
  { v: 'ignite',         label: 'Ignite' },
  { v: 'accelerate',     label: 'Accelerate' },
  { v: 'dominate',       label: 'Dominate' },
  { v: 'street_pulse',   label: 'Street Pulse' },
  { v: 'township_pulse', label: 'Township Pulse' },
  { v: 'other',          label: 'Not sure' },
];

const TEMPERATURE = [
  { v: 'cold', label: '❄️ Cold' },
  { v: 'warm', label: '🌤 Warm' },
  { v: 'hot',  label: '🔥 Hot' },
];

const KEENNESS = [
  { v: 'ready_now',   label: 'Ready now' },
  { v: 'this_month',  label: 'This month' },
  { v: 'exploring',   label: 'Just exploring' },
];

const BEST_TIME = [
  { v: 'morning',   label: 'Morning' },
  { v: 'afternoon', label: 'Afternoon' },
  { v: 'evening',   label: 'Evening' },
];

const CHANNEL = [
  { v: 'call',      label: 'Phone call' },
  { v: 'whatsapp',  label: 'WhatsApp' },
  { v: 'sms',       label: 'SMS' },
  { v: 'email',     label: 'Email' },
];

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

function roleToSource(r) {
  if (r === 'owner') return 'owner_direct';
  if (r === 'admin') return 'admin_direct';
  if (r === 'cpc')   return 'cpc_outbound';
  return 'field_agent_direct';
}

function PillPicker({ label, options, value, onChange }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-medium text-soft">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(value === o.v ? null : o.v)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              value === o.v
                ? 'border-brandred bg-brandred/20 text-brandred font-semibold'
                : 'border-darkbg-border bg-darkbg-900/60 text-soft hover:border-brandred/40'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NewLead() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    business_name: '', contact_person: '', phone: '', email: '',
    address: '', industry: '',
    lead_temperature: '', interest_package: '', keenness: '',
    best_time: '', preferred_channel: '',
  });
  const [answers, setAnswers] = useState({});
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [dupDialog, setDupDialog] = useState(null); // null | { matchedLeadId, matchedBusiness, matchedCapturer, matchedAt }

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const field = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Load qualification questions from system_settings
  const { data: questionsRow } = useQuery({
    queryKey: ['sys', 'lead.qualification_questions.v1'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'lead.qualification_questions.v1')
        .maybeSingle();
      if (error) throw error;
      return Array.isArray(data?.value) ? data.value : [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const questions = questionsRow ?? [];

  // Do-not-contact pre-check (client-side UX only; server trigger is the guarantee)
  async function checkDnc() {
    const or = [];
    if (form.phone.trim()) or.push(`phone.eq.${form.phone.trim()}`);
    if (form.email.trim()) or.push(`email.eq.${form.email.trim().toLowerCase()}`);
    if (or.length === 0) return false;
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('do_not_contact', true)
      .or(or.join(','))
      .limit(1);
    return (data ?? []).length > 0;
  }

  const mutation = useMutation({
    mutationFn: async ({ dupAcknowledged = false } = {}) => {
      // Client-side DNC pre-check
      const isDnc = await checkDnc();
      if (isDnc) throw new Error('do_not_contact_violation: this contact has opted out of being contacted');

      // Photo upload (optional)
      let shopfrontPhotoUrl = null;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('lead-photos')
          .upload(path, photoFile, { contentType: photoFile.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('lead-photos').getPublicUrl(path);
        shopfrontPhotoUrl = pub.publicUrl;
      }

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      const { error } = await supabase.from('leads').insert({
        business_name:          form.business_name.trim() || null,
        contact_person:         form.contact_person.trim() || null,
        phone:                  form.phone.trim() || null,
        email:                  form.email.trim() || null,
        address:                form.address.trim() || null,
        industry:               form.industry.trim() || null,
        lead_temperature:       form.lead_temperature || null,
        interest_package:       form.interest_package || null,
        keenness:               form.keenness || null,
        best_time:              form.best_time || null,
        preferred_channel:      form.preferred_channel || null,
        qualification_answers:  Object.keys(answers).length > 0 ? answers : null,
        shopfront_photo_url:    shopfrontPhotoUrl,
        source:                 roleToSource(role),
        captured_via:           'staff_app',
        status:                 'pending_verification',
        submitted_by:           user.id,
        submitted_by_name:      profileRow?.full_name ?? null,
        duplicate_acknowledged: dupAcknowledged || undefined,
      });

      if (error) {
        // 45D01 soft duplicate — look up the matched lead directly (more
        // reliable than parsing err.details, which PostgREST/supabase-js
        // may or may not pass through for custom SQLSTATE ranges).
        if (error.code === '45D01' || error.message?.includes('possible_duplicate')) {
          const or = [];
          if (form.phone.trim()) or.push(`phone.eq.${form.phone.trim()}`);
          if (form.email.trim()) or.push(`email.eq.${form.email.trim().toLowerCase()}`);
          let matchedLead = null;
          if (or.length > 0) {
            const { data: mRow } = await supabase
              .from('leads')
              .select('id, business_name, submitted_by_name, created_at')
              .or(or.join(','))
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();
            matchedLead = mRow;
          }
          const dupErr = Object.assign(new Error('possible_duplicate'), {
            isDuplicate:     true,
            matchedLeadId:   matchedLead?.id               ?? null,
            matchedBusiness: matchedLead?.business_name    ?? null,
            matchedCapturer: matchedLead?.submitted_by_name ?? null,
            matchedAt:       matchedLead?.created_at       ?? null,
          });
          throw dupErr;
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Lead captured successfully');
      if (role === 'field_agent' || role === 'cpc') {
        navigate('/owner/leads/my');
      } else {
        navigate('/owner/sales/leads');
      }
    },
    onError: (err) => {
      const msg = err?.message ?? String(err);

      if (msg.includes('do_not_contact_violation')) {
        toast.error('This contact has opted out of being contacted.');
        return;
      }

      if (err?.isDuplicate) {
        setDupDialog({
          matchedLeadId:   err.matchedLeadId,
          matchedBusiness: err.matchedBusiness,
          matchedCapturer: err.matchedCapturer,
          matchedAt:       err.matchedAt,
        });
        return;
      }

      toast.error(msg || 'Failed to capture lead');
    },
  });

  function onPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Photo must be under 5 MB');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.business_name.trim()) {
      toast.error('Business name is required');
      return;
    }
    if (!form.phone.trim() && !form.email.trim()) {
      toast.error('Phone or email is required');
      return;
    }
    mutation.mutate({});
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-5 flex items-center gap-1 text-sm text-soft hover:text-white"
      >
        <ChevronLeft size={16} /> Back
      </button>

      <h1 className="font-display mb-1 text-2xl text-gradient">New lead</h1>
      <p className="mb-6 text-sm text-soft">Fill in what you know — more is better, but phone or email is the minimum.</p>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Contact info */}
        <section className="card p-4 space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-soft">Contact</h2>
          <input
            required
            placeholder="Business name *"
            value={form.business_name}
            onChange={field('business_name')}
            className="input w-full"
          />
          <input
            placeholder="Contact person"
            value={form.contact_person}
            onChange={field('contact_person')}
            className="input w-full"
          />
          <input
            placeholder="Phone number"
            type="tel"
            value={form.phone}
            onChange={field('phone')}
            className="input w-full"
          />
          <input
            placeholder="Email address"
            type="email"
            value={form.email}
            onChange={field('email')}
            className="input w-full"
          />
          <input
            placeholder="Address"
            value={form.address}
            onChange={field('address')}
            className="input w-full"
          />
          <input
            placeholder="Industry"
            value={form.industry}
            onChange={field('industry')}
            className="input w-full"
          />
        </section>

        {/* Lead qualification */}
        <section className="card p-4">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-soft mb-4">Qualification</h2>

          <PillPicker label="Temperature" options={TEMPERATURE} value={form.lead_temperature} onChange={set('lead_temperature')} />
          <PillPicker label="Interested package" options={PACKAGES}  value={form.interest_package} onChange={set('interest_package')} />
          <PillPicker label="Keenness"    options={KEENNESS}     value={form.keenness}          onChange={set('keenness')} />
          <PillPicker label="Best time"   options={BEST_TIME}    value={form.best_time}          onChange={set('best_time')} />
          <PillPicker label="Preferred channel" options={CHANNEL} value={form.preferred_channel} onChange={set('preferred_channel')} />
        </section>

        {/* Dynamic qualification questions */}
        {questions.length > 0 && (
          <section className="card p-4 space-y-3">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-soft">Business questions</h2>
            {questions.map(q => (
              <div key={q.id}>
                <label className="mb-1 block text-sm text-soft">{q.label}</label>
                <input
                  placeholder="Enter answer"
                  value={answers[q.id] ?? ''}
                  onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                  className="input w-full"
                />
              </div>
            ))}
          </section>
        )}

        {/* Shopfront photo */}
        <section className="card p-4">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-soft mb-3">Shopfront photo <span className="normal-case font-normal">(optional)</span></h2>
          {photoPreview ? (
            <div className="relative w-full max-w-xs">
              <img src={photoPreview} alt="Preview" className="rounded-lg object-cover w-full h-40" />
              <button
                type="button"
                onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                className="absolute top-2 right-2 rounded-full bg-darkbg-900/80 p-1 text-white hover:bg-brandred/80"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-darkbg-border p-6 text-soft hover:border-brandred/40 transition-colors">
              <Camera size={28} />
              <span className="text-sm">Tap to take or upload a photo</span>
              <span className="text-xs text-soft/60">Max 5 MB · JPG / PNG / WebP</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onPhotoChange}
                capture="environment"
              />
            </label>
          )}
        </section>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn-primary w-full py-3 text-base"
        >
          {mutation.isPending ? 'Saving…' : 'Capture lead'}
        </button>
      </form>

      {dupDialog && (
        <DuplicateConfirmDialog
          variant="staff"
          matchedLeadId={dupDialog.matchedLeadId}
          matchedBusiness={dupDialog.matchedBusiness}
          matchedCapturer={dupDialog.matchedCapturer}
          matchedAt={dupDialog.matchedAt}
          loading={mutation.isPending}
          onConfirm={() => {
            setDupDialog(null);
            mutation.mutate({ dupAcknowledged: true });
          }}
          onCancel={() => setDupDialog(null)}
        />
      )}
    </div>
  );
}
