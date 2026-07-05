import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Shield } from 'lucide-react';
import { supabase } from '../../../lib/supabase.js';
import { CHECKLIST_ITEMS } from '../../../constants/contractChecklist.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-ZA', { dateStyle: 'medium' }) : '—';

const fmtDt = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

function StatusBadge({ status }) {
  const map = {
    draft:           'bg-gray-600 text-gray-200',
    generated:       'bg-blue-700 text-blue-100',
    sent:            'bg-yellow-600 text-yellow-100',
    verified:        'bg-purple-700 text-purple-100',
    active:          'bg-green-700 text-green-100',
    fully_executed:  'bg-emerald-700 text-emerald-100',
    cancelled:       'bg-red-700 text-red-100',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${map[status] ?? 'bg-white/[0.06] text-gray-200'}`}>
      {status?.replace('_', ' ') ?? 'unknown'}
    </span>
  );
}

function PackageBadge({ pkg }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-700 text-indigo-100 uppercase tracking-wide">
      {pkg ?? '—'}
    </span>
  );
}

function Card({ title, children }) {
  return (
    <div className="card p-6">
      {title && <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>}
      {children}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-1.5 border-b border-white/[0.06] last:border-0">
      <span className="text-gray-400 text-sm w-44 shrink-0">{label}</span>
      <span className="text-white text-sm">{children}</span>
    </div>
  );
}

// ─── section: Summary ───────────────────────────────────────────────────────

function SummaryCard({ data }) {
  return (
    <Card title="Summary">
      <Row label="Client">{data.client_name ?? '—'}</Row>
      <Row label="Package"><PackageBadge pkg={data.package_name} /></Row>
      <Row label="Setup Fee">R {Number(data.setup_fee ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</Row>
      <Row label="Monthly Fee">R {Number(data.monthly_fee ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</Row>
      <Row label="Status"><StatusBadge status={data.status} /></Row>
      <Row label="Contract Version">{data.contract_version ?? '—'}</Row>
      <Row label="Created">{fmt(data.created_at)}</Row>
      <Row label="Signed">{fmt(data.signed_at)}</Row>
      {data.status === 'sent' && data.signing_link && (
        <Row label="Signing Link">
          <a
            href={data.signing_link}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 underline break-all"
          >
            {data.signing_link}
          </a>
        </Row>
      )}
    </Card>
  );
}

// ─── section: Sales Checklist ────────────────────────────────────────────────

function SalesChecklistCard({ checklist, contractId }) {
  if (!checklist) {
    return (
      <Card title="Sales Checklist">
        <p className="text-gray-400 text-sm mb-3">Checklist not yet submitted.</p>
        <Link
          to={`/owner/contracts/${contractId}/sales-checklist`}
          className="inline-block px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium transition"
        >
          Complete Sales Checklist
        </Link>
      </Card>
    );
  }

  return (
    <Card title="Sales Checklist">
      <p className="text-gray-400 text-xs mb-3">
        Submitted by <span className="text-white">{checklist.completed_by ?? '—'}</span>{' '}
        on {fmtDt(checklist.completed_at)}
      </p>
      <ul className="space-y-1.5">
        {CHECKLIST_ITEMS.map((item) => {
          const checked = checklist.items?.[item.key] === true;
          return (
            <li key={item.key} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 text-base ${checked ? 'text-green-400' : 'text-gray-600'}`}>
                {checked ? '✅' : '☐'}
              </span>
              <span className={checked ? 'text-white' : 'text-gray-400'}>
                {item.label}
                {item.highRisk && (
                  <span className="ml-1 text-xs text-red-400 font-semibold">[HIGH RISK]</span>
                )}
              </span>
              <span className="ml-auto text-gray-500 text-xs shrink-0">{item.clause}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ─── section: Admin Verify-Call ──────────────────────────────────────────────

const vcStatusIcon = (s) => {
  if (s === 'yes' || s === true) return '✅';
  if (s === 'no' || s === false) return '❌';
  return '⚠️';
};

function VerifyCallCard({ verifyCall, contractId }) {
  if (!verifyCall) {
    return (
      <Card title="Admin Verify-Call">
        <p className="text-gray-400 text-sm mb-3">Verify-call not yet completed.</p>
        <Link
          to={`/owner/contracts/${contractId}/verify-call`}
          className="inline-block px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium transition"
        >
          Complete Verify-Call
        </Link>
      </Card>
    );
  }

  const items = verifyCall.items ?? {};

  const verifiedBadge = (label, val) => (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
        val ? 'bg-green-800 text-green-200' : 'bg-red-900 text-red-300'
      }`}
    >
      {val ? '✅' : '❌'} {label}
    </span>
  );

  return (
    <Card title="Admin Verify-Call">
      <div className="flex flex-wrap gap-2 mb-4">
        {verifiedBadge('Banking Verified', verifyCall.banking_verified)}
        {verifiedBadge('Contact Verified', verifyCall.contact_verified)}
        {verifiedBadge('Identity Verified', verifyCall.identity_verified)}
      </div>
      <ul className="space-y-1.5">
        {Object.entries(items).map(([key, val]) => (
          <li key={key} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 text-base">{vcStatusIcon(val)}</span>
            <span className="text-gray-300 capitalize">{key.replace(/_/g, ' ')}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── section: Signatures ─────────────────────────────────────────────────────

function SignaturesCard({ signatures }) {
  if (!signatures?.length) {
    return (
      <Card title="Signatures">
        <p className="text-gray-500 text-sm">No signatures recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card title="Signatures">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-gray-400 border-b border-white/[0.06]">
              <th className="pb-2 pr-4 font-medium">Agreement Part</th>
              <th className="pb-2 pr-4 font-medium">Signer Role</th>
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Method</th>
              <th className="pb-2 font-medium">Signed At</th>
            </tr>
          </thead>
          <tbody>
            {signatures.map((sig, i) => (
              <tr key={i} className="border-b border-white/[0.06] last:border-0">
                <td className="py-2 pr-4 text-white">{sig.agreement_part ?? '—'}</td>
                <td className="py-2 pr-4 text-gray-300">{sig.signer_role ?? '—'}</td>
                <td className="py-2 pr-4 text-gray-300">{sig.signer_full_name ?? '—'}</td>
                <td className="py-2 pr-4">
                  {sig.method === 'prefilled' ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-gray-600 text-gray-200">
                      Pre-filled
                    </span>
                  ) : (
                    <span className="text-gray-300">{sig.method ?? '—'}</span>
                  )}
                </td>
                <td className="py-2 text-gray-400">{fmtDt(sig.signed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── section: PDF Preview ────────────────────────────────────────────────────

function PdfCard({ documentUrl }) {
  const [showEmbed, setShowEmbed] = useState(false);

  if (!documentUrl) return null;

  return (
    <Card title="PDF Preview">
      <div className="flex gap-3 mb-4">
        <a
          href={documentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block px-4 py-2 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium transition"
        >
          Open PDF in New Tab
        </a>
        <button
          onClick={() => setShowEmbed((v) => !v)}
          className="inline-block px-4 py-2 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium transition"
        >
          {showEmbed ? 'Hide Preview' : 'Preview Here'}
        </button>
      </div>
      {showEmbed && (
        <iframe
          src={documentUrl}
          title="Contract PDF"
          className="w-full h-[70vh] rounded border border-white/[0.08]"
        />
      )}
    </Card>
  );
}

// ─── section: Verification Scanner ──────────────────────────────────────────

function VerificationCard({ contractId }) {
  const vQ = useQuery({
    queryKey: ['contract-verification', contractId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_contract_verification', { p_contract_id: contractId });
      if (error) throw error;
      return data;
    },
  });

  if (vQ.isLoading) return <Card title="Verification Scanner"><p className="text-gray-400 text-sm animate-pulse">Loading…</p></Card>;
  if (vQ.isError) return <Card title="Verification Scanner"><p className="text-red-400 text-sm">{vQ.error?.message}</p></Card>;

  const { checks, pass_count, total } = vQ.data;
  const pct = Math.round((pass_count / total) * 100);

  return (
    <Card title="Verification Scanner">
      <div className="flex items-center gap-3 mb-4">
        <Shield size={20} className={pass_count === total ? 'text-green-400' : 'text-yellow-400'} />
        <div className="flex-1">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-white font-medium">{pass_count} of {total} checks passed</span>
            <span className="text-gray-400">{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pass_count === total ? 'bg-green-500' : 'bg-yellow-500'}`}
                 style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <ul className="space-y-2">
        {checks.map((ch) => (
          <li key={ch.key} className="flex items-start gap-2 text-sm">
            {ch.pass
              ? <CheckCircle2 size={16} className="mt-0.5 text-green-400 shrink-0" />
              : <XCircle size={16} className="mt-0.5 text-red-400 shrink-0" />}
            <div>
              <span className={ch.pass ? 'text-white' : 'text-gray-300'}>{ch.label}</span>
              {ch.evidence && <p className="text-xs text-gray-500 mt-0.5">{ch.evidence}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Action Buttons ──────────────────────────────────────────────────────────

function ActionBar({ contract, onAction }) {
  const { status, document_url: docUrl, signing_link: signingLink } = contract;

  const copyLink = () => {
    if (signingLink) {
      navigator.clipboard.writeText(signingLink);
      alert('Signing link copied to clipboard.');
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {/* draft / generated */}
      {(status === 'draft' || status === 'generated') && (
        <>
          {docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium transition"
            >
              View Contract
            </a>
          )}
          <button
            onClick={() => onAction('send')}
            className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium transition"
          >
            Send to Client
          </button>
        </>
      )}

      {/* sent */}
      {status === 'sent' && (
        <>
          {docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium transition"
            >
              View Contract
            </a>
          )}
          <button
            onClick={() => onAction('resend')}
            className="px-4 py-2 rounded bg-yellow-700 hover:bg-yellow-600 text-white text-sm font-medium transition"
          >
            Resend
          </button>
          {signingLink && (
            <button
              onClick={copyLink}
              className="px-4 py-2 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium transition"
            >
              Copy Signing Link
            </button>
          )}
        </>
      )}

      {/* verified */}
      {status === 'verified' && (
        <>
          <button
            onClick={() => onAction('approve')}
            className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition"
          >
            Approve
          </button>
          <button
            onClick={() => onAction('send_back')}
            className="px-4 py-2 rounded bg-red-700 hover:bg-red-600 text-white text-sm font-medium transition"
          >
            Send Back
          </button>
        </>
      )}

      {/* active / fully_executed */}
      {(status === 'active' || status === 'fully_executed') && (
        <>
          {docUrl && (
            <>
              <a
                href={docUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium transition"
              >
                View Contract
              </a>
              <a
                href={docUrl}
                download
                className="px-4 py-2 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium transition"
              >
                Download
              </a>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContractDetail() {
  const { contractId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: rpcError } = await supabase.rpc('get_contract_detail', {
        p_contract_id: contractId,
      });
      if (rpcError) throw rpcError;
      setData(result);
    } catch (err) {
      setError(err.message ?? 'Failed to load contract.');
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (action) => {
    setActionLoading(true);
    try {
      if (action === 'approve') {
        const { error: err } = await supabase.rpc('approve_contract', {
          p_contract_id: contractId,
        });
        if (err) throw err;
        await fetchData();
      } else if (action === 'send_back') {
        const reason = prompt('Reason for sending back:');
        if (!reason) return;
        const { error: err } = await supabase.rpc('send_back_contract', {
          p_contract_id: contractId,
          p_reason: reason,
        });
        if (err) throw err;
        await fetchData();
      } else if (action === 'send' || action === 'resend') {
        alert(`Action "${action}" is not yet wired up.`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Loading contract…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const contract = data.contract ?? data;
  const checklist = data.sales_checklist ?? null;
  const verifyCall = data.verify_call ?? null;
  const signatures = data.signatures ?? [];

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-gray-400 text-sm mb-1">
              <Link to="/owner/contracts" className="hover:text-white transition">
                Contracts
              </Link>{' '}
              / {contract.client_name ?? contractId}
            </p>
            <h1 className="text-2xl font-bold text-white">Contract Detail</h1>
          </div>
          {actionLoading ? (
            <span className="text-gray-400 text-sm animate-pulse">Processing…</span>
          ) : (
            <ActionBar contract={contract} onAction={handleAction} />
          )}
        </div>

        {/* Cards */}
        <SummaryCard data={contract} />
        <SalesChecklistCard checklist={checklist} contractId={contractId} />
        <VerifyCallCard verifyCall={verifyCall} contractId={contractId} />
        <SignaturesCard signatures={signatures} />
        <VerificationCard contractId={contractId} />
        <PdfCard documentUrl={contract.document_url} />
      </div>
    </div>
  );
}
