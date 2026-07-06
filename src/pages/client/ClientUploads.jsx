import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase.js';
import MascotGuide from '../../components/MascotGuide.jsx';

const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp,application/pdf,.ai,.psd,.eps';
const MAX = 10 * 1024 * 1024;

export default function ClientUploads() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const dataQ = useQuery({
    queryKey: ['my-uploads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients')
        .select('id, brand_assets_urls').eq('client_user_id', (await supabase.auth.getUser()).data.user?.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const clientId = dataQ.data?.id;
  const assets = dataQ.data?.brand_assets_urls ?? [];

  const uploadFiles = async (files) => {
    if (!clientId || !files.length) return;
    setBusy(true);
    let ok = 0;
    const next = [...assets];
    try {
      for (const file of files) {
        if (file.size > MAX) { toast.error(`${file.name} exceeds 10MB`); continue; }
        const path = `${clientId}/brand-assets/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from('client-uploads').upload(path, file, { upsert: true });
        if (error) { toast.error(error.message); continue; }
        const { data: pub } = supabase.storage.from('client-uploads').getPublicUrl(path);
        next.push(pub.publicUrl); ok++;
      }
      if (ok > 0) {
        const { error: upErr } = await supabase.rpc('client_self_update', { p_payload: { brand_assets_urls: next } });
        if (upErr) throw upErr;
        await supabase.rpc('notify_staff_on_upload', { p_file_count: ok });
        toast.success(`${ok} file(s) uploaded`);
        qc.invalidateQueries({ queryKey: ['my-uploads'] });
        qc.invalidateQueries({ queryKey: ['client-dashboard'] });
      }
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const removeAsset = async (url) => {
    const next = assets.filter(u => u !== url);
    const { error } = await supabase.rpc('client_self_update', { p_payload: { brand_assets_urls: next } });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ['my-uploads'] });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-[#0B2143]">Brand Uploads</h1>
        <p className="text-sm text-gray-500 mt-1">Share your logos, photos, flyers and design files.</p>
      </div>

      <label
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(Array.from(e.dataTransfer.files || [])); }}
        className={`block rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition ${
          dragOver ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white hover:border-red-300'
        }`}>
        {busy ? <Loader2 size={28} className="mx-auto animate-spin text-gray-400" /> : <Upload size={28} className="mx-auto text-gray-400" />}
        <p className="mt-3 text-sm text-[#0B2143] font-medium">Drop your brand files here</p>
        <p className="text-xs text-gray-400 mt-1">logos, photos, flyers, design files · max 10MB each</p>
        <input type="file" multiple accept={ACCEPT} className="hidden"
               onChange={e => { uploadFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
      </label>

      {dataQ.isLoading ? (
        <div className="flex flex-col items-center justify-center py-8">
          <MascotGuide phase="thinking" size={72} message="Fetching your uploads..." position="inline" />
        </div>
      ) : dataQ.isError ? (
        <div className="flex flex-col items-center justify-center py-8">
          <MascotGuide phase="sad" size={72} message={dataQ.error?.message || "Something went wrong. Try refreshing."} position="inline" />
        </div>
      ) : assets.length === 0 ? (
        <div className="mio-glow-border rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl shadow-sm p-8">
          <MascotGuide phase="guide" size={80} message="No files uploaded yet — drop something above to get started." position="inline" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {assets.map((url, i) => {
            const isImg = /\.(jpe?g|png|gif|webp|svg)$/i.test(url);
            return (
              <div key={i} className="relative group rounded-xl border border-white/80 bg-white/85 backdrop-blur-xl p-2 shadow-sm">
                {isImg
                  ? <img src={url} alt="" className="h-24 w-full rounded object-cover" />
                  : <div className="h-24 w-full rounded bg-gray-50 flex items-center justify-center"><FileText size={24} className="text-gray-400" /></div>}
                <a href={url} target="_blank" rel="noreferrer" className="block mt-1 text-[10px] text-gray-400 truncate">{url.split('/').pop()}</a>
                <button onClick={() => removeAsset(url)}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500 p-1 opacity-0 group-hover:opacity-100 transition">
                  <Trash2 size={10} className="text-white" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
