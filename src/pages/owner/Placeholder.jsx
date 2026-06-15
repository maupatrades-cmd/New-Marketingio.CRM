export default function Placeholder({ title }) {
  return (
    <div className="card p-8 text-center">
      <h1 className="font-display text-2xl">
        <span className="text-gradient">{title}</span>
      </h1>
      <p className="mt-3 text-soft">Slice not built yet. Coming after slice 1 verification.</p>
    </div>
  );
}
