import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase.js';
import { CHECKLIST_ITEMS } from '../../../constants/contractChecklist.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmtZAR = (amount) =>
  amount != null
    ? `R ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

const fmtDt = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

// ─── Read-only submitted view ─────────────────────────────────────────────────

function ReadOnlyChecklist({ checklist, contract }) {
  const { submitted_by_name, submitted_at, items } = checklist;
  return (
    <div className="space-y-4">
      <div className="bg-green-900/40 border border-green-700 rounded-lg px-4 py-3 text-sm text-green-300">
        Sales checklist certified by <strong>{submitted_by_name ?? 'Unknown'}</strong> on{' '}
        {fmtDt(submitted_at)}.
      </div>

      <div className="space-y-2">
        {CHECKLIST_ITEMS.map((item) => {
          const entry = items?.[item.key] ?? {};
          return (
            <div
              key={item.key}
              className={`bg-darkbg-800 rounded-lg px-4 py-3 flex gap-3 items-start ${
                item.highRisk ? 'border-l-4 border-red-500' : ''
              }`}
            >
              <span className="text-green-400 text-lg leading-none mt-0.5">✅</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">{item.label}</p>
                <p className="text-gray-400 text-xs mt-0.5">Clause {item.clause}</p>
                {item.highRisk && (
                  <span className="inline-block mt-1 text-xs text-red-400 font-semibold">
                    ⚠ High risk — explain carefully
                  </span>
                )}
                {entry.notes && (
                  <p className="mt-1 text-xs text-gray-300 bg-darkbg-900 rounded px-2 py-1">
                    {entry.notes}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SalesChecklist() {
  const { contractId } = useParams();
  const navigate = useNavigate();

  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // checklist state: { [key]: { ticked: bool, notes: string, showNotes: bool } }
  const [items, setItems] = useState(() =>
    Object.fromEntries(
      CHECKLIST_ITEMS.map((i) => [i.key, { ticked: false, notes: '', showNotes: false }])
    )
  );

  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // ─── fetch ────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: rpcErr } = await supabase.rpc('get_contract_detail', {
        p_contract_id: contractId,
      });
      if (rpcErr) {
        setError(rpcErr.message);
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        setContract(row ?? null);
      }
      setLoading(false);
    }
    load();
  }, [contractId]);

  // ─── item handlers ────────────────────────────────────────────────────────

  const toggleTick = (key) =>
    setItems((prev) => ({ ...prev, [key]: { ...prev[key], ticked: !prev[key].ticked } }));

  const setNotes = (key, val) =>
    setItems((prev) => ({ ...prev, [key]: { ...prev[key], notes: val } }));

  const toggleNotes = (key) =>
    setItems((prev) => ({
      ...prev,
      [key]: { ...prev[key], showNotes: !prev[key].showNotes },
    }));

  // ─── submit ───────────────────────────────────────────────────────────────

  const allTicked = CHECKLIST_ITEMS.every((i) => items[i.key].ticked);

  const handleSubmit = async () => {
    setAttemptedSubmit(true);
    if (!allTicked) return;

    const itemsObj = Object.fromEntries(
      CHECKLIST_ITEMS.map((i) => [
        i.key,
        { explained: true, notes: items[i.key].notes },
      ])
    );

    setSubmitting(true);
    const { error: rpcErr } = await supabase.rpc('submit_sales_checklist', {
      p_contract_id: contractId,
      p_items: itemsObj,
    });
    setSubmitting(false);

    if (rpcErr) {
      setToast({ type: 'error', msg: rpcErr.message });
      return;
    }

    setToast({ type: 'success', msg: 'Checklist certified successfully!' });
    setTimeout(() => {
      navigate(`/owner/contracts/${contractId}`);
    }, 1800);
  };

  // ─── render states ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-darkbg-900 flex items-center justify-center text-gray-400 text-sm">
        Loading contract…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-darkbg-900 flex flex-col items-center justify-center gap-3 text-red-400 text-sm px-4">
        <p>Failed to load contract: {error}</p>
        <Link to={`/owner/contracts/${contractId}`} className="text-indigo-400 underline">
          Back to contract
        </Link>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-darkbg-900 flex flex-col items-center justify-center gap-3 text-gray-400 text-sm">
        <p>Contract not found.</p>
        <Link to="/owner/contracts" className="text-indigo-400 underline">
          All contracts
        </Link>
      </div>
    );
  }

  const alreadySubmitted = !!contract.sales_checklist;

  return (
    <div className="min-h-screen bg-darkbg-900 text-white px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Breadcrumb ── */}
        <nav className="text-xs text-gray-400 flex gap-1 items-center">
          <Link to="/owner/contracts" className="hover:text-white">Contracts</Link>
          <span>/</span>
          <Link to={`/owner/contracts/${contractId}`} className="hover:text-white">
            {contract.client_name ?? contractId}
          </Link>
          <span>/</span>
          <span className="text-gray-200">Sales Checklist</span>
        </nav>

        {/* ── Header card ── */}
        <div className="card bg-darkbg-800 rounded-xl px-5 py-4 space-y-2">
          <h1 className="text-xl font-bold text-white">Sales Checklist — Stage A</h1>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-gray-200 font-semibold">{contract.client_name ?? '—'}</span>
            {contract.package && (
              <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-700 text-indigo-100 uppercase tracking-wide">
                {contract.package}
              </span>
            )}
          </div>
          <div className="flex gap-6 text-sm text-gray-300">
            <span>Setup: <strong className="text-white">{fmtZAR(contract.setup_fee)}</strong></span>
            <span>Monthly: <strong className="text-white">{fmtZAR(contract.monthly_retainer)}</strong></span>
          </div>
        </div>

        {/* ── Toast ── */}
        {toast && (
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-900/60 border border-green-700 text-green-300'
                : 'bg-red-900/60 border border-red-700 text-red-300'
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* ── Already submitted: read-only ── */}
        {alreadySubmitted ? (
          <ReadOnlyChecklist checklist={contract.sales_checklist} contract={contract} />
        ) : (
          <>
            {/* ── Checklist items ── */}
            <div className="space-y-2">
              {CHECKLIST_ITEMS.map((item) => {
                const state = items[item.key];
                return (
                  <div
                    key={item.key}
                    className={`bg-darkbg-800 rounded-lg px-4 py-3 space-y-2 ${
                      item.highRisk ? 'border-l-4 border-red-500' : ''
                    }`}
                  >
                    <label className="flex gap-3 items-start cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={state.ticked}
                        onChange={() => toggleTick(item.key)}
                        className="mt-0.5 w-4 h-4 accent-indigo-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-white text-sm font-medium">{item.label}</span>
                        <span className="block text-gray-400 text-xs mt-0.5">
                          Clause {item.clause}
                        </span>
                        {item.highRisk && (
                          <span className="inline-block mt-1 text-xs text-red-400 font-semibold">
                            ⚠ High risk — explain carefully
                          </span>
                        )}
                      </div>
                    </label>

                    {/* Notes toggle */}
                    <div className="pl-7">
                      <button
                        type="button"
                        onClick={() => toggleNotes(item.key)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                      >
                        {state.showNotes ? 'Hide note' : 'Add note'}
                      </button>
                      {state.showNotes && (
                        <textarea
                          rows={2}
                          value={state.notes}
                          onChange={(e) => setNotes(item.key, e.target.value)}
                          placeholder="Optional note…"
                          className="mt-1 w-full bg-darkbg-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Validation warning ── */}
            {attemptedSubmit && !allTicked && (
              <div className="bg-yellow-900/40 border border-yellow-700 rounded-lg px-4 py-3 text-sm text-yellow-300">
                All 14 items must be ticked before you can certify this checklist.
              </div>
            )}

            {/* ── Submit ── */}
            <div className="pb-8">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className={`w-full py-3 px-6 rounded-lg text-sm font-semibold transition-colors ${
                  submitting
                    ? 'bg-indigo-800 text-indigo-300 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {submitting
                  ? 'Submitting…'
                  : 'I certify I explained all 14 items to this client'}
              </button>
            </div>
          </>
        )}

        {/* ── Back link ── */}
        {alreadySubmitted && (
          <div className="pb-8">
            <Link
              to={`/owner/contracts/${contractId}`}
              className="inline-block text-sm text-indigo-400 hover:text-indigo-300 underline"
            >
              ← Back to contract
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
