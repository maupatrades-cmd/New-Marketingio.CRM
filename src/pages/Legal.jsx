import { Link } from 'react-router-dom';

const LOGO_URL =
  'https://media.base44.com/images/public/69f52863b2b733d922d90b62/ce0ebdea2_marketing_io_main_logo-removebg-preview.png';

export function Terms() {
  return <LegalShell title="Terms & Conditions">
    <p><strong>Last updated:</strong> {new Date().toLocaleDateString('en-ZA')}</p>
    <p>These Terms govern your use of the Marketing iO platform operated by Marketing iO (Pty) Ltd ("we", "us"). By creating an account or using the service you accept these Terms.</p>

    <h2>1. The service</h2>
    <p>Marketing iO is a customer relationship and marketing-services platform aimed at South African SMEs. Specific deliverables, pricing, term and cancellation rights for paid packages are governed by the Master Service Agreement signed at point of sale.</p>

    <h2>2. Your account</h2>
    <p>You are responsible for keeping your password confidential and for all activity under your account. Notify <a href="mailto:support@marketingio.co.za">support@marketingio.co.za</a> immediately of any unauthorised use.</p>

    <h2>3. Acceptable use</h2>
    <p>You may not use Marketing iO to send spam, infringe third-party rights, breach POPIA, or attempt to circumvent rate-limits, RLS policies, or other security controls.</p>

    <h2>4. Payments</h2>
    <p>Recurring fees are debited monthly via the payment method on file. Failed debits trigger our standard follow-up process. Refunds are governed by the package-specific Refund Policy in your MSA.</p>

    <h2>5. Limitation of liability</h2>
    <p>To the maximum extent permitted by South African law, our aggregate liability for any claim arising out of the service is limited to the fees paid by you in the 12 months preceding the claim.</p>

    <h2>6. Governing law</h2>
    <p>These Terms are governed by the laws of the Republic of South Africa. Any dispute is subject to the jurisdiction of the High Court of South Africa, Gauteng Division.</p>

    <h2>7. Contact</h2>
    <p>Questions: <a href="mailto:support@marketingio.co.za">support@marketingio.co.za</a>.</p>
  </LegalShell>;
}

export function Privacy() {
  return <LegalShell title="Privacy Policy">
    <p><strong>Last updated:</strong> {new Date().toLocaleDateString('en-ZA')}</p>
    <p>Marketing iO (Pty) Ltd is the responsible party under the Protection of Personal Information Act, 2013 ("POPIA"). This Policy explains what personal information we collect, why, and your rights.</p>

    <h2>1. What we collect</h2>
    <ul>
      <li>Identifying info: name, email, mobile number, business name, address.</li>
      <li>Account info: hashed password, role, login timestamps, IP address, user-agent.</li>
      <li>Business profile: industry, employee count, marketing assets, revenue range.</li>
      <li>Billing info: invoices, payments, debit-order mandate metadata.</li>
      <li>Communications: emails, in-app messages, support tickets.</li>
    </ul>

    <h2>2. Why we use it</h2>
    <p>To operate your account, deliver the services in your MSA, communicate with you, run our payroll/commission engine, and improve the platform. We process personal information only for the purposes you have consented to or as permitted by POPIA.</p>

    <h2>3. Who we share with</h2>
    <p>Sub-processors strictly necessary for the service: PayFast (payments), Resend (email), Supabase (hosting + database), Vercel (frontend hosting), Cloudinary (asset CDN). We do not sell your personal information.</p>

    <h2>4. Retention</h2>
    <p>Account and billing records are retained for 5 years after account closure for tax + audit purposes. Marketing logs older than 12 months are aggregated and anonymised.</p>

    <h2>5. Your rights</h2>
    <p>You may access, correct, or delete your personal information by writing to <a href="mailto:support@marketingio.co.za">support@marketingio.co.za</a> with the subject line <em>POPIA request</em>. Deletion takes effect after a 14-day cool-off window unless you request immediate processing.</p>

    <h2>6. Security</h2>
    <p>All traffic is encrypted in transit (TLS 1.2+). At rest, the database is encrypted with AES-256. Row-Level Security policies ensure clients can only access their own records.</p>

    <h2>7. Information Officer</h2>
    <p>Thapelo Maupa, Director — <a href="mailto:support@marketingio.co.za">support@marketingio.co.za</a>.</p>
  </LegalShell>;
}

function LegalShell({ title, children }) {
  return (
    <div className="min-h-screen bg-auth">
      <div className="mx-auto max-w-3xl px-6 pt-10 pb-16">
        <Link to="/login" className="inline-block">
          <img src={LOGO_URL} alt="Marketing iO" className="mb-6 h-14 w-auto object-contain" />
        </Link>
        <article className="card-light prose prose-slate max-w-none p-6 sm:p-8">
          <h1 className="font-display text-3xl text-navy-ink mb-6">{title}</h1>
          <div className="space-y-3 text-sm leading-relaxed text-navy-900/80
                          [&_h2]:font-display [&_h2]:text-lg [&_h2]:text-navy-ink [&_h2]:mt-6 [&_h2]:mb-2
                          [&_a]:text-brandred [&_a:hover]:underline
                          [&_ul]:list-disc [&_ul]:pl-6">
            {children}
          </div>
        </article>
        <p className="mt-6 text-center text-xs text-navy-900/60">
          <Link to="/login" className="hover:text-navy-ink hover:underline">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
