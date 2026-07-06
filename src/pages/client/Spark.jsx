import BrandAdvisor from '../../components/client/BrandAdvisor.jsx';

export default function Spark() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Spark — Brand Advisor</h1>
        <p className="text-sm text-slate-500 mt-1">
          Ask for content, captions, promo copy, or marketing advice tailored to your business. 5 questions a day.
        </p>
      </div>
      <div className="h-[calc(100vh-260px)] min-h-[520px] max-h-[820px]">
        <BrandAdvisor />
      </div>
    </div>
  );
}
