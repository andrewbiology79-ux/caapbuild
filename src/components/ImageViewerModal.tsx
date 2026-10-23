import React, { useState, useEffect, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigation } from '../utils/navigation';
import { toBn } from '../utils/toBn';

export interface ImageViewerModalProps {
  isOpen: boolean;
  images: Array<{ url: string; alt?: string }>;
  initialIndex?: number;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  isOpen,
  images,
  initialIndex = 0,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const { registerBackHandler } = useNavigation();

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  // Handle Android Back button
  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerBackHandler(() => {
      onClose();
      return true;
    });
    return unregister;
  }, [isOpen, onClose, registerBackHandler]);

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex] || images[0];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="চিত্র প্রদর্শক"
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none animate-in fade-in duration-200"
    >
      {/* Top Bar with Safe Area Inset */}
      <div
        className="w-full flex items-center justify-between px-4 py-2 z-10 bg-gradient-to-b from-black/80 to-transparent"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
      >
        {/* Index counter */}
        <div className="text-white text-xs font-semibold px-2 py-1 bg-white/20 rounded-full">
          {images.length > 1
            ? `${toBn(currentIndex + 1)} / ${toBn(images.length)}`
            : 'চিত্র'}
        </div>

        {/* Close Button */}
        <button
          type="button"
          aria-label="বন্ধ করুন"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Zoom / Pan Canvas */}
      <div className="flex-1 w-full h-full relative flex items-center justify-center overflow-hidden">
        <TransformWrapper
          key={currentIndex}
          initialScale={1}
          minScale={0.8}
          maxScale={6}
          centerOnInit
          doubleClick={{ mode: 'toggle' }}
        >
          <TransformComponent
            wrapperClass="!w-full !h-full flex items-center justify-center"
            contentClass="!w-full !h-full flex items-center justify-center"
          >
            <img
              src={currentImage.url}
              alt={currentImage.alt || 'চিত্র'}
              className="max-h-[85vh] max-w-[96vw] object-contain select-none pointer-events-auto"
              style={{ objectFit: 'contain' }}
              draggable={false}
            />
          </TransformComponent>
        </TransformWrapper>

        {/* Left Navigation Arrow */}
        {images.length > 1 && (
          <button
            type="button"
            aria-label="পূর্ববর্তী চিত্র"
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center z-10 border border-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Right Navigation Arrow */}
        {images.length > 1 && (
          <button
            type="button"
            aria-label="পরবর্তী চিত্র"
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center z-10 border border-white/20"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom hint / indicator with Safe Area Inset */}
      <div
        className="w-full text-center pb-4 text-[0.6875rem] text-white/60 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <span>জুম করতে পিঞ্চ বা ডাবল ট্যাপ করুন</span>
      </div>
    </div>
  );
};

export default ImageViewerModal;
