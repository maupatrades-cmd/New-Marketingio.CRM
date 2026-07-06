import { Link } from 'react-router-dom';
import { ShoppingBag, ArrowRight } from 'lucide-react';

export default function ClientOrders() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Orders</h1>
        <p className="text-sm text-gray-500 mt-1">Add-ons and custom work you've ordered.</p>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-10 text-center">
        <ShoppingBag size={32} className="mx-auto mb-3 text-gray-300" />
        <p className="text-gray-500">No orders yet.</p>
        <Link to="/client/products" className="mt-3 inline-flex items-center gap-1 text-sm text-red-500 font-semibold hover:underline">
          Browse our products <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
