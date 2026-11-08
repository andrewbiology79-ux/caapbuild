import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, RotateCcw, RotateCw, Check, Crop as CropIcon } from 'lucide-react';
import { useBackClose } from '../utils/useBackClose';
import {
  DEFAULT_EDIT,
  EDIT_MAX_DIM,
  applyScanToCanvas,
  buildEditedCanvas,
  canvasToFile,
  drawRotated,
  isEdited,
  setCropEdge,
  type CropEdge,
  type ImageEditParams,
  type Rotation,
  type ScanMode,
} from '../utils/imageEdit';
import { toBn } from '../utils/toBn';

export interface ImageEditQueueProps {
  files: File[];
  /** যে ছবিগুলো যোগ হবে (এডিট করা বা যেমন আছে); বাদ দেওয়া ছবি তালিকায় থাকে না */
  onFinish: (result: File[]) => void;
}

const EDGES: Array<{ key: CropEdge; label: string }> = [
  { key: 'top', label: 'উপর' },
  { key: 'bottom', label: 'নিচ' },
  { key: 'left', label: 'বাম' },
  { key: 'right', label: 'ডান' },
];

const SCANS: Array<{ key: ScanMode; label: string }> = [
  { key: 'off', label: 'যেমন আছে' },
  { key: 'gray', label: 'পরিষ্কার (গ্রে)' },
  { key: 'bw', label: 'সাদা-কালো' },
];

/** ছবি বাছার পরে এক এক করে এডিটর দেখায়: ঘোরানো, ক্রপ, স্ক্যান মোড */
export const ImageEditQueue: React.FC<ImageEditQueueProps> = ({ files, onFinish }) => {
  const [index, setIndex] = useState(0);
  const [params, setParams] = useState<ImageEditParams>(DEFAULT_EDIT);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const file = files[index];
  const isLast = index === files.length - 1;

  // এ পর্যন্ত যোগ হওয়া ছবি (ref, কারণ state দেরিতে বদলায়)
  const resultsRef = useRef<File[]>([]);

  const advance = (added: File | null) => {
    const next = added ? [...resultsRef.current, added] : resultsRef.current;
    resultsRef.current = next;
    if (isLast) {
      onFinish(next);
    } else {
      setIndex((i) => i + 1);
    }
  };

  const keepRestUnedited = () => {
    const rest = files.slice(index);
    const next = [...resultsRef.current, ...rest];
    resultsRef.current = next;
    onFinish(next);
  };

  // Back বাটন = কোণার X-এর মতো: এই ছবি বাদ, পরেরটায় যাও
  useBackClose(true, () => {
    if (!busy) advance(null);
  });

  // নতুন ছবি লোড
  useEffect(() => {
    setParams(DEFAULT_EDIT);
    setImg(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    let alive = true;
    image.onload = () => {
      if (alive) setImg(image);
    };
    image.onerror = () => {
      // পড়া যায়নি (যেমন অচেনা ফরম্যাট) - এডিট ছাড়াই পরের ধাপে (পরের কম্প্রেসই আসল ফল বলবে)
      if (alive) advance(file);
    };
    image.src = url;
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // ঘোরানো ছবি (স্ক্যান ছাড়া) - ক্রপ স্লাইডার নাড়লে আবার আঁকতে হয় না
  const rotated = useMemo(() => (img ? drawRotated(img, params.rotation, EDIT_MAX_DIM) : null), [img, params.rotation]);

  // প্রিভিউ-র জন্য স্ক্যান-করা কপি (শুধু ঘোরানো/স্ক্যান বদলালে নতুন করে)
  const scanned = useMemo(() => {
    if (!rotated) return null;
    if (params.scan === 'off') return rotated;
    const c = document.createElement('canvas');
    c.width = rotated.width;
    c.height = rotated.height;
    c.getContext('2d')!.drawImage(rotated, 0, 0);
    applyScanToCanvas(c, params.scan);
    return c;
  }, [rotated, params.scan]);

  // প্রিভিউ আঁকা: ছবি + কাটা অংশ ছায়া দিয়ে ঢাকা
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !scanned) return;
    const maxW = Math.min(window.innerWidth - 32, 420);
    const maxH = Math.max(180, Math.round(window.innerHeight * 0.38));
    const s = Math.min(maxW / scanned.width, maxH / scanned.height, 1);
    const w = Math.max(1, Math.round(scanned.width * s));
    const h = Math.max(1, Math.round(scanned.height * s));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(scanned, 0, 0, w, h);
    const { left, right, top, bottom } = params.crop;
    const x0 = left * w;
    const x1 = w - right * w;
    const y0 = top * h;
    const y1 = h - bottom * h;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, y0);
    ctx.fillRect(0, y1, w, h - y1);
    ctx.fillRect(0, y0, x0, y1 - y0);
    ctx.fillRect(x1, y0, w - x1, y1 - y0);
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, y0 + 1, Math.max(1, x1 - x0 - 2), Math.max(1, y1 - y0 - 2));
  }, [scanned, params.crop]);

  const rotate = (dir: 1 | -1) =>
    setParams((p) => ({ ...p, rotation: ((p.rotation + (dir === 1 ? 90 : 270)) % 360) as Rotation, crop: DEFAULT_EDIT.crop }));

  const handleOk = async () => {
    if (!rotated || !file) return;
    if (!isEdited(params)) {
      advance(file);
      return;
    }
    setBusy(true);
    try {
      const canvas = buildEditedCanvas(rotated, params);
      const edited = await canvasToFile(canvas, file.name);
      advance(edited);
    } catch (err) {
      console.error('Image edit failed:', err);
      advance(file); // এডিট না হলে আসল ছবিই যোগ হোক - কিছু হারায় না
    } finally {
      setBusy(false);
    }
  };

  if (!file) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ছবি এডিট"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70"
    >
      <div className="w-full max-w-[460px] max-h-[96vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 h-12 border-b border-[#D5D9E2] shrink-0">
          <div className="flex items-center gap-2 text-sm font-bold text-[#1B1F2A]">
            <CropIcon className="w-4 h-4 text-[#3B4FD8]" />
            <span>
              ছবি এডিট{files.length > 1 ? ` (${toBn(index + 1)}/${toBn(files.length)})` : ''}
            </span>
          </div>
          <button
            type="button"
            aria-label="এই ছবি বাদ দাও"
            onClick={() => advance(null)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F2F4F8]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-2 flex flex-col items-center gap-3">
          <div className="min-h-[120px] flex items-center justify-center bg-[#F2F4F8] rounded-lg p-1">
            {img ? <canvas ref={previewRef} className="max-w-full rounded" /> : <span className="text-xs text-[#64748B] p-8">ছবি লোড হচ্ছে...</span>}
          </div>

          <div className="w-full flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => rotate(-1)}
              className="min-h-[44px] px-4 rounded-xl border border-[#D5D9E2] text-xs font-semibold text-[#1B1F2A] flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>বাঁয়ে ঘোরাও</span>
            </button>
            <button
              type="button"
              onClick={() => rotate(1)}
              className="min-h-[44px] px-4 rounded-xl border border-[#D5D9E2] text-xs font-semibold text-[#1B1F2A] flex items-center gap-1.5"
            >
              <RotateCw className="w-4 h-4" />
              <span>ডানে ঘোরাও</span>
            </button>
          </div>

          <div className="w-full space-y-1">
            <p className="text-xs font-bold text-[#1B1F2A]">ক্রপ (কেটে ফেলার অংশ)</p>
            {EDGES.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 text-xs text-[#64748B]">
                <span className="w-8 shrink-0">{label}</span>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={1}
                  value={Math.round(params.crop[key] * 100)}
                  onChange={(e) => setParams((p) => ({ ...p, crop: setCropEdge(p.crop, key, Number(e.target.value) / 100) }))}
                  className="flex-1 min-h-[28px] accent-[#3B4FD8]"
                  aria-label={`${label} থেকে কাটো`}
                />
                <span className="w-9 text-right tabular-nums">{toBn(Math.round(params.crop[key] * 100))}%</span>
              </label>
            ))}
          </div>

          <div className="w-full space-y-1">
            <p className="text-xs font-bold text-[#1B1F2A]">স্ক্যান মোড (কাগজের ছবির জন্য)</p>
            <div className="grid grid-cols-3 gap-2">
              {SCANS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={params.scan === key}
                  onClick={() => setParams((p) => ({ ...p, scan: key }))}
                  className={`min-h-[44px] px-1 rounded-xl border text-[0.6875rem] font-semibold leading-tight ${
                    params.scan === key
                      ? 'bg-[#3B4FD8] border-[#3B4FD8] text-white'
                      : 'bg-white border-[#D5D9E2] text-[#1B1F2A]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 pt-1 space-y-2 shrink-0">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => advance(file)}
              disabled={busy}
              className="min-h-[44px] px-3 rounded-xl border border-[#D5D9E2] text-sm font-medium text-[#1B1F2A] bg-white disabled:opacity-50"
            >
              এডিট ছাড়া রাখো
            </button>
            <button
              type="button"
              onClick={handleOk}
              disabled={!img || busy}
              className="min-h-[44px] px-3 rounded-xl text-sm font-bold text-white bg-[#3B4FD8] flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{busy ? 'হচ্ছে...' : 'ঠিক আছে'}</span>
            </button>
          </div>
          {!isLast && (
            <button
              type="button"
              onClick={keepRestUnedited}
              disabled={busy}
              className="w-full min-h-[40px] text-xs font-semibold text-[#3B4FD8]"
            >
              বাকি ছবিগুলো এডিট ছাড়াই যোগ করো
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageEditQueue;
