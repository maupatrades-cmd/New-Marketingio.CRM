import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase.js';
import { CHECKLIST_ITEMS } from '../../../constants/contractChecklist.js';

const RADIO_OPTIONS = [
  { value: 'confirmed',    label: '✅ Confirmed' },
  { value: 'not_explained', label: '❌ Not explained' },
  { value: 'unsure',       label: '⚠ Unsure' },
];

function needsNotes(status) {
  return status === 'not_explained' || status === 'unsure';
}

export default function AdminVerifyCall() {
  const { contractId } = useParams();

  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // item state: { [key]: { status: string|null, notes: string } }
  const [items, setItems] = useState(() =>
    Object.fromEntries(CHECKLIST_ITEMS.map(c => [c.key, { status: null, notes: '' }]))
  );

  // extra confirms
  const [bankingOk, setBankingOk]   = useState(false);
  const [contactOk, setContactOk]   = useState(false);
  const [identityOk, setIdentityOk] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcErr } = await supabase.rpc('get_contract_detail', {
          p_contract_id: contractId,
        });
        if (rpcErr) throw rpcErr;
        const detail = Array.isArray(data) ? data[0] : data;
        setContract(detail);

        // If already submitted, populate read-only state
        if (detail?.admin_checklist_items) {
          const saved = detail.admin_checklist_items;
          setItems(prev => {
            const next = { ...prev };
            Object.keys(saved).forEach(k => {
              if (next[k] !== undefined) next[k] = { ...next[k], ...saved[k] };
            });
            return next;
          });
          setBankingOk(!!detail.admin_banking_ok);
          setContactOk(!!detail.admin_contact_ok);
          setIdentityOk(!!detail.admin_identity_ok);
          setSubmitted(true);
        }
      } catch (err) {
        setError(err.message ?? 'Failed to load contract.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [contractId]);

  function setItemStatus(key, status) {
    setItems(prev => ({
      ...prev,
      [key]: { ...prev[key], status, notes: needsNotes(status) ? prev[key].notes : '' },
    }));
  }

  function setItemNotes(key, notes) {
    setItems(prev => ({ ...prev, [key]: { ...prev[key], notes } }));
  }

  function validate() {
    for (const c of CHECKLIST_ITEMS) {
      const item = items[c.key];
      if (!item.status) return `Please select a status for: "${c.label}"`;
      if (needsNotes(item.status) && !item.notes.trim())
        return `Notes required for: "${c.label}"`;
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);

    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    const itemsObj = Object.fromEntries(
      CHECKLIST_ITEMS.map(c => [
        c.key,
        { status: items[c.key].status, notes: items[c.key].notes },
      ])
    );

    setSubmitting(true);
    try {
      const { error: rpcErr } = await supabase.rpc('submit_admin_checklist', {
        p_contract_id: contractId,
        p_items:       itemsObj,
        p_banking_ok:  bankingOk,
        p_contact_ok:  contactOk,
        p_identity_ok: identityOk,
      });
      if (rpcErr) throw rpcErr;
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message ?? 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-darkbg-900 text-white flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Loading contract…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-darkbg-900 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <Link to="/owner/contracts" className="text-blue-400 underline text-sm">
          ← Back to contracts
        </Link>
      </div>
    );
  }

  const clientName    = contract?.client_name ?? '—';
  const phone         = contract?.contact_phone ?? '—';
  const whatsapp      = contract?.whatsapp_number ?? '—';
  const closerName    = contract?.closer_name ?? '—';
  const stageAAt      = contract?.stage_a_submitted_at
    ? new Date(contract.stage_a_submitted_at).toLocaleString()
    : '—';

  return (
    <div className="min-h-screen bg-darkbg-900 text-white py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Back link */}
        <Link
          to={`/owner/contracts/${contractId}`}
          className="text-blue-400 underline text-sm"
        >
          ← Back to contract
        </Link>

        {/* Page title */}
        <h1 className="text-2xl font-bold">Verify-Call — Stage B</h1>

        {/* Header card */}
        <div className="card bg-darkbg-800 rounded-xl p-6 space-y-3 border border-gray-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Client</p>
              <p className="text-lg font-semibold">{clientName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Closer</p>
              <p className="font-medium">{closerName}</p>
              <p className="text-xs text-gray-500">Stage A submitted: {stageAAt}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-700">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Phone</p>
              <p className="font-mono">{phone}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">WhatsApp</p>
              <p className="font-mono">{whatsapp}</p>
            </div>
          </div>
        </div>

        {/* Read-only banner */}
        {submitted && (
          <div className="bg-green-900/50 border border-green-600 rounded-lg px-4 py-3 text-green-300 text-sm">
            ✅ Verify-call checklist already submitted. Showing read-only view.
          </div>
        )}

        {/* Checklist form */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Checklist items */}
          <div className="card bg-darkbg-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
            {CHECKLIST_ITEMS.map((c, idx) => {
              const item = items[c.key];
              return (
                <div key={c.key} className="p-4 space-y-3">
                  {/* Item header */}
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 text-xs pt-0.5 w-5 shrink-0">{idx + 1}.</span>
                    <div className="flex-1">
                      <p className="font-medium text-sm leading-snug">
                        {c.label}
                        {c.highRisk && (
                          <span className="ml-2 text-xs bg-red-800/60 text-red-300 rounded px-1.5 py-0.5">
                            High risk
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">Clause {c.clause}</p>
                    </div>
                  </div>

                  {/* Radio options */}
                  <div className="flex flex-wrap gap-3 pl-7">
                    {RADIO_OPTIONS.map(opt => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                          item.status === opt.value
                            ? opt.value === 'confirmed'
                              ? 'border-green-500 bg-green-900/30 text-green-300'
                              : opt.value === 'not_explained'
                              ? 'border-red-500 bg-red-900/30 text-red-300'
                              : 'border-yellow-500 bg-yellow-900/30 text-yellow-300'
                            : 'border-gray-600 text-gray-400 hover:border-gray-400'
                        } ${submitted ? 'pointer-events-none opacity-80' : ''}`}
                      >
                        <input
                          type="radio"
                          name={c.key}
                          value={opt.value}
                          checked={item.status === opt.value}
                          onChange={() => !submitted && setItemStatus(c.key, opt.value)}
                          disabled={submitted}
                          className="sr-only"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>

                  {/* Notes textarea */}
                  {needsNotes(item.status) && (
                    <div className="pl-7">
                      <textarea
                        rows={2}
                        placeholder="Notes (required)…"
                        value={item.notes}
                        onChange={e => !submitted && setItemNotes(c.key, e.target.value)}
                        disabled={submitted}
                        className="w-full bg-darkbg-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-70 resize-none"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Extra confirms */}
          <div className="card bg-darkbg-800 rounded-xl border border-gray-700 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
              Additional Verifications
            </h2>
            {[
              {
                id: 'banking',
                label: 'Banking verified',
                hint: 'Account holder name & last 4 digits match',
                value: bankingOk,
                setter: setBankingOk,
              },
              {
                id: 'contact',
                label: 'Contact verified',
                hint: 'Phone & WhatsApp are working',
                value: contactOk,
                setter: setContactOk,
              },
              {
                id: 'identity',
                label: 'Identity verified',
                hint: 'Matches ID / Registration captured',
                value: identityOk,
                setter: setIdentityOk,
              },
            ].map(({ id, label, hint, value, setter }) => (
              <label
                key={id}
                className={`flex items-start gap-3 cursor-pointer ${submitted ? 'pointer-events-none' : ''}`}
              >
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={e => !submitted && setter(e.target.checked)}
                    disabled={submitted}
                    className="w-4 h-4 rounded border-gray-600 bg-darkbg-900 text-blue-500 focus:ring-0 focus:ring-offset-0"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-gray-500">{hint}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Validation / submit error */}
          {submitError && (
            <div className="bg-red-900/50 border border-red-600 rounded-lg px-4 py-3 text-red-300 text-sm">
              {submitError}
            </div>
          )}

          {/* Submit */}
          {!submitted && (
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit verify-call'}
            </button>
          )}

          {submitted && (
            <Link
              to={`/owner/contracts/${contractId}`}
              className="block text-center w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold transition-colors"
            >
              Back to contract
            </Link>
          )}
        </form>

      </div>
    </div>
  );
}
