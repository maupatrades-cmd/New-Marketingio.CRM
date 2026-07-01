import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Loader2, PenLine, FileText, X } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

// /sign/:signing_token — PUBLIC. No auth required.

export default function SignContract() {
  const { signing_token } = useParams();
  const [phase, setPhase] = useState('loading'); // loading | error | ready | signed
  const [contractData, setContractData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Signature state
  const [masterTab, setMasterTab] = useState('type'); // 'type' | 'draw'
  const [popiaTab, setPopiaTab] = useState('type');
  const [masterTyped, setMasterTyped] = useState('');
  const [popiaTyped, setPopiaTyped] = useState('');
  const masterCanvasRef = useRef(null);
  const popiaCanvasRef = useRef(null);

  // Additional fields
  const [initials, setInitials] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [capacity, setCapacity] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_contract_for_signing', {
          p_token: signing_token,
        });
        if (error) throw error;
        const record = Array.isArray(data) ? data[0] : data;
        if (!record || record.ok === false) {
          setErrorMsg(record?.error === 'invalid_token'
            ? 'This signing link is invalid or has expired'
            : 'Unable to load contract');
          setPhase('error');
          return;
        }
        setContractData(record);
        setPhase('ready');
      } catch (err) {
        setErrorMsg(err?.message || 'This signing link is invalid or has expired');
        setPhase('error');
      }
    })();
  }, [signing_token]);

  // ── Canvas helpers ──────────────────────────────────────────────────────────
  const makeCanvasHandlers = (canvasRef) => {
    let drawing = false;

    const getPos = (e, canvas) => {
      const rect = canvas.getBoundingClientRect();
      if (e.touches) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const start = (e) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawing = true;
      const ctx = canvas.getContext('2d');
      const { x, y } = getPos(e, canvas);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (e) => {
      e.preventDefault();
      if (!drawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const { x, y } = getPos(e, canvas);
      ctx.lineTo(x, y);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    };
    const end = (e) => {
      e.preventDefault();
      drawing = false;
    };
    const clear = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    return { start, move, end, clear };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const masterHandlers = useCallback(() => makeCanvasHandlers(masterCanvasRef), [])();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const popiaHandlers = useCallback(() => makeCanvasHandlers(popiaCanvasRef), [])();

  const isCanvasBlank = (canvasRef) => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return !data.some(v => v !== 0);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitError('');

    // Validate master signature
    const masterMethod = masterTab;
    const masterPayloadSig = masterTab === 'type' ? masterTyped.trim() : null;
    const masterDrawn = masterTab === 'draw' ? (masterCanvasRef.current?.toDataURL() ?? null) : null;
    if (masterTab === 'type' && !masterPayloadSig) {
      setSubmitError('Please provide your Part 1 signature.');
      return;
    }
    if (masterTab === 'draw' && isCanvasBlank(masterCanvasRef)) {
      setSubmitError('Please draw your Part 1 signature.');
      return;
    }

    // Validate popia signature
    const popiaMethod = popiaTab;
    const popiaPayloadSig = popiaTab === 'type' ? popiaTyped.trim() : null;
    const popiaDrawn = popiaTab === 'draw' ? (popiaCanvasRef.current?.toDataURL() ?? null) : null;
    if (popiaTab === 'type' && !popiaPayloadSig) {
      setSubmitError('Please provide your Part 7 (POPIA) signature.');
      return;
    }
    if (popiaTab === 'draw' && isCanvasBlank(popiaCanvasRef)) {
      setSubmitError('Please draw your Part 7 (POPIA) signature.');
      return;
    }

    if (!initials.trim()) { setSubmitError('Please enter your initials.'); return; }
    if (!fullName.trim()) { setSubmitError('Please enter your full name.'); return; }
    if (!email.trim()) { setSubmitError('Please enter your email address.'); return; }
    if (!idNumber.trim()) { setSubmitError('Please enter your ID or registration number.'); return; }
    if (!capacity.trim()) { setSubmitError('Please select your capacity.'); return; }

    setSubmitting(true);
    try {
      const contractId = contractData?.contract_id ?? contractData?.id;

      const buildPayload = (typedSig, drawnSig) => ({
        signer_full_name: fullName.trim(),
        signer_email: email.trim(),
        signer_id_number: idNumber.trim(),
        signer_capacity: capacity,
        ...(typedSig ? { typed_signature: typedSig } : {}),
        ...(drawnSig ? { drawn_signature_data_url: drawnSig } : {}),
      });

      const methodMap = { type: 'typed', draw: 'drawn' };

      // 1. Master signature
      const { error: e1 } = await supabase.rpc('record_signature', {
        p_contract_id: contractId,
        p_agreement_part: 'master',
        p_signer_role: 'client',
        p_method: methodMap[masterMethod],
        p_payload: buildPayload(masterPayloadSig, masterDrawn),
      });
      if (e1) throw e1;

      // 2. POPIA signature
      const { error: e2 } = await supabase.rpc('record_signature', {
        p_contract_id: contractId,
        p_agreement_part: 'popia',
        p_signer_role: 'client',
        p_method: methodMap[popiaMethod],
        p_payload: buildPayload(popiaPayloadSig, popiaDrawn),
      });
      if (e2) throw e2;

      // 3. Initials
      const { error: e3 } = await supabase.rpc('record_initials', {
        p_contract_id: contractId,
        p_party: 'client',
        p_initials_text: initials.trim(),
      });
      if (e3) throw e3;

      setPhase('signed');
    } catch (err) {
      setSubmitError(err?.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <PageShell>
        <Loader2 size={28} className="mx-auto animate-spin text-gray-400" />
        <p className="mt-3 text-center text-sm text-gray-500">Loading your agreement…</p>
      </PageShell>
    );
  }

  if (phase === 'error') {
    return (
      <PageShell>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle size={28} className="mx-auto text-red-500" />
          <h1 className="mt-3 text-xl font-semibold text-gray-900">Signing Link Invalid</h1>
          <p className="mt-2 text-sm text-gray-600">{errorMsg}</p>
          <p className="mt-4 text-xs text-gray-500">
            If you think this is a mistake, email{' '}
            <a className="text-red-600 underline" href="mailto:support@marketingio.co.za">
              support@marketingio.co.za
            </a>
          </p>
        </div>
      </PageShell>
    );
  }

  if (phase === 'signed') {
    return (
      <PageShell>
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
          <CheckCircle2 size={36} className="mx-auto text-green-500" />
          <h1 className="mt-4 text-2xl font-semibold text-gray-900">Contract signed successfully!</h1>
          <p className="mt-2 text-sm text-gray-600">
            Thank you, <strong>{fullName}</strong>. Your signatures have been recorded. You will receive a
            copy of the signed agreement by email shortly.
          </p>
          <p className="mt-4 text-xs text-gray-400">Marketing iO — marketingio.co.za</p>
        </div>
      </PageShell>
    );
  }

  // phase === 'ready'
  const summary = contractData?.cover_summary ?? contractData ?? {};
  const clientName = summary.client_name ?? contractData?.client_name ?? '—';
  const packageName = summary.package_name ?? contractData?.package_name ?? contractData?.package ?? '—';
  const setupFee = summary.setup_fee ?? contractData?.setup_fee;
  const monthlyFee = summary.monthly_retainer ?? contractData?.monthly_retainer;
  const documentUrl = contractData?.document_url ?? summary.document_url;

  return (
    <PageShell>
      <div className="space-y-8">
        {/* Header */}
        <header className="text-center">
          <img
            src="https://res.cloudinary.com/didwjb1et/image/upload/v1781625284/marketingio_footer_clean_1_ykjdzr.png"
            alt="Marketing iO"
            className="mx-auto h-16 w-auto object-contain"
          />
          <p className="mt-2 text-sm text-gray-500">Service Agreement — Client Signing Portal</p>
        </header>

        {/* Contract Info */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Your Agreement</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <InfoRow label="Client" value={clientName} />
            <InfoRow label="Package" value={packageName} />
            {setupFee != null && <InfoRow label="Setup Fee" value={fmtZar(setupFee)} />}
            {monthlyFee != null && <InfoRow label="Monthly Retainer" value={fmtZar(monthlyFee)} />}
          </dl>
          {documentUrl && (
            <a
              href={documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
            >
              <FileText size={15} />
              View Agreement Document (PDF)
            </a>
          )}
        </section>

        {/* Marketing iO Already Signed */}
        {(() => {
          const auth = contractData?.mio_authority ?? {};
          const signerName = auth.signer_name ?? 'Marketing iO';
          const signerCapacity = auth.signer_capacity ?? 'Director';
          const signerInitials = auth.signer_initials ?? '';
          return (
            <section className="rounded-2xl border border-green-200 bg-green-50 p-5">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 size={18} />
                <span className="text-sm font-semibold">Marketing iO has already signed this agreement</span>
              </div>
              <div className="mt-3 rounded-xl border border-green-200 bg-white px-4 py-3 text-sm text-gray-700">
                <p className="font-semibold text-gray-900">{signerName}</p>
                <p className="text-gray-500">{signerCapacity}{signerInitials ? ` — ${signerInitials}` : ''}</p>
                <p className="mt-1 italic text-gray-400 font-serif text-base">{signerName}</p>
              </div>
            </section>
          );
        })()}

        {/* Part 1 — Master Service Agreement */}
        <SignatureWidget
          title="Part 1 — Master Service Agreement"
          description="By signing below you agree to the Master Service Agreement terms."
          tab={masterTab}
          onTabChange={setMasterTab}
          typed={masterTyped}
          onTypedChange={setMasterTyped}
          canvasRef={masterCanvasRef}
          handlers={masterHandlers}
        />

        {/* Part 7 — POPIA Operator Agreement */}
        <SignatureWidget
          title="Part 7 — POPIA Operator Agreement"
          description="By signing below you consent to the POPIA Operator Agreement and data processing terms."
          tab={popiaTab}
          onTabChange={setPopiaTab}
          typed={popiaTyped}
          onTypedChange={setPopiaTyped}
          canvasRef={popiaCanvasRef}
          handlers={popiaHandlers}
        />

        {/* Initials */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">Initials</h2>
          <p className="mb-3 text-xs text-gray-500">
            Your initials represent your acknowledgement on all pages.
          </p>
          <input
            type="text"
            maxLength={6}
            placeholder="e.g. SM"
            value={initials}
            onChange={e => setInitials(e.target.value.toUpperCase())}
            className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-bold tracking-widest text-gray-900 uppercase focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
          />
        </section>

        {/* Signer Details */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Your Details</h2>

          <Field label="Full Name" required>
            <input
              type="text"
              placeholder="e.g. Sipho Mokoena"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Email Address" required>
            <input
              type="email"
              placeholder="e.g. sipho@company.co.za"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="ID Number / Registration Number" required>
            <input
              type="text"
              placeholder="e.g. 8001015009087 or 2010/012345/07"
              value={idNumber}
              onChange={e => setIdNumber(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Signing Capacity" required>
            <select
              value={capacity}
              onChange={e => setCapacity(e.target.value)}
              className={inputCls}
            >
              <option value="">— Select —</option>
              <option value="Director">Director</option>
              <option value="Owner">Owner</option>
              <option value="Member">Member</option>
              <option value="Sole Proprietor">Sole Proprietor</option>
              <option value="Authorised Signatory">Authorised Signatory</option>
              <option value="Other">Other</option>
            </select>
          </Field>
        </section>

        {/* Submit */}
        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-600 to-pink-500 px-6 py-4 text-base font-semibold text-white shadow-md hover:opacity-90 transition disabled:opacity-50"
        >
          {submitting
            ? <><Loader2 size={18} className="animate-spin" /> Submitting…</>
            : <><PenLine size={18} /> Sign and Submit</>}
        </button>

        <p className="text-center text-xs text-gray-400 pb-8">
          By clicking "Sign and Submit" you confirm your acceptance of all agreement parts listed above.
          This constitutes a legally binding electronic signature.
        </p>
      </div>
    </PageShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SignatureWidget({ title, description, tab, onTabChange, typed, onTypedChange, canvasRef, handlers }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 mb-4 text-xs text-gray-500">{description}</p>

      {/* Tabs */}
      <div className="mb-4 flex rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit gap-1">
        {['type', 'draw'].map(t => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              tab === t
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'type' ? 'Type' : 'Draw'}
          </button>
        ))}
      </div>

      {tab === 'type' && (
        <div>
          <input
            type="text"
            placeholder="Type your full name"
            value={typed}
            onChange={e => onTypedChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
          />
          {typed && (
            <p className="mt-2 text-2xl italic font-serif text-gray-800 border-b border-gray-300 pb-1">
              {typed}
            </p>
          )}
        </div>
      )}

      {tab === 'draw' && (
        <div>
          <div className="relative rounded-lg border border-gray-300 bg-gray-50 overflow-hidden">
            <canvas
              ref={canvasRef}
              width={560}
              height={140}
              className="w-full touch-none cursor-crosshair"
              style={{ display: 'block' }}
              onMouseDown={handlers.start}
              onMouseMove={handlers.move}
              onMouseUp={handlers.end}
              onMouseLeave={handlers.end}
              onTouchStart={handlers.start}
              onTouchMove={handlers.move}
              onTouchEnd={handlers.end}
            />
            <button
              type="button"
              onClick={handlers.clear}
              className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 shadow-sm hover:bg-gray-100 transition"
            >
              <X size={12} /> Clear
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">Sign with your mouse or finger on touch screens.</p>
        </div>
      )}
    </section>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-gray-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

function PageShell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200';

const fmtZar = n =>
  'R ' + Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
