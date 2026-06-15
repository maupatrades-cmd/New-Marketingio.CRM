export default function Wordmark({ size = 'lg' }) {
  const text = size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-2xl' : 'text-lg';
  return (
    <div className={`font-display font-bold tracking-tight ${text} text-navy-ink`}>
      MARKETING
      <span className="relative ml-1 inline-flex items-center">
        <span className="text-brandred">i</span>
        <span className="ml-0.5 inline-flex h-[0.9em] w-[0.9em] items-center justify-center rounded-full bg-brandred text-white" style={{ fontSize: '0.7em' }}>
          O
        </span>
      </span>
    </div>
  );
}
