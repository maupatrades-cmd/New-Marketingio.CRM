// Duplicate-lead confirmation dialog — two surface variants.
//
// variant="staff"  → full info: business name, capturer, date, [View existing] + [Capture anyway]
// variant="public" → POPIA-clean: locked copy only, no names, [Submit anyway]
//
// Props:
//   variant         'staff' | 'public'
//   matchedLeadId   string | null           (staff + public — used for [View existing])
//   matchedBusiness string | null           (staff only)
//   matchedCapturer string | null           (staff only)
//   matchedAt       ISO string | null       (staff only)
//   loading         boolean
//   onConfirm       () => void              ("Capture anyway" / "Submit anyway")
//   onCancel        () => void

import { AlertTriangle, ExternalLink, X } from 'lucide-react';

export default function DuplicateConfirmDialog({
  variant = 'staff',
  matchedLeadId   = null,
  matchedBusiness = null,
  matchedCapturer = null,
  matchedAt       = null,
  loading         = false,
  onConfirm,
  onCancel,
}) {
  const formattedDate = matchedAt
    ? new Date(matchedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-md p-6 relative">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="absolute top-4 right-4 text-soft hover:text-white disabled:opacity-40"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={24} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-white text-lg leading-tight">Possible duplicate</h2>
            {variant === 'staff' ? (
              <p className="text-sm text-soft mt-1">
                A lead with this phone or email already exists in the system.
              </p>
            ) : (
              <p className="text-sm text-soft mt-1">
                We already have this referral on file. Thanks for thinking of us — our team will follow up.
              </p>
            )}
          </div>
        </div>

        {variant === 'staff' && (matchedBusiness || matchedCapturer || formattedDate) && (
          <div className="mb-5 rounded-lg bg-darkbg-900/60 border border-darkbg-border p-3 space-y-1 text-sm">
            {matchedBusiness && (
              <p className="text-white font-medium">{matchedBusiness}</p>
            )}
            {matchedCapturer && (
              <p className="text-soft">Captured by <span className="text-white">{matchedCapturer}</span></p>
            )}
            {formattedDate && (
              <p className="text-soft">On <span className="text-white">{formattedDate}</span></p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="btn-primary w-full disabled:opacity-40"
          >
            {loading
              ? 'Saving…'
              : variant === 'staff'
                ? 'Capture anyway'
                : 'Submit anyway'}
          </button>

          {variant === 'staff' && matchedLeadId && (
            <a
              href={`/owner/sales/leads?highlight=${matchedLeadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost w-full flex items-center justify-center gap-1"
            >
              <ExternalLink size={14} /> View existing lead
            </a>
          )}

          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-ghost w-full disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
