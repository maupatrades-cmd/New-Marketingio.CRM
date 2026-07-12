import { useNavigate } from 'react-router-dom';
import Mascot from '../../components/Mascot.jsx';

export default function ComingSoonPage({ title }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Mascot size={64} className="mb-6 opacity-80" />
      <h1 className="font-display text-3xl mb-3">
        <span className="text-gradient">{title}</span>
      </h1>
      <p className="max-w-sm text-soft leading-relaxed mb-8">
        This page is being built. Your work IS being tracked in the system — the view is coming soon.
      </p>
      <button
        onClick={() => navigate('/owner/my-day')}
        className="btn-primary"
      >
        Back to My Day
      </button>
    </div>
  );
}
