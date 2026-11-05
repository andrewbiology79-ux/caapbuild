import React, { useMemo } from 'react';
import { RichText } from './RichText';
import { parseSolution } from '../utils/solutionParts';

export interface SolutionViewProps {
  text: string | undefined;
  imageIds: string[] | undefined;
  imageUrls: Record<string, string>;
  textClassName?: string;
  /** called with every loaded picture of this solution and the index of the tapped one */
  onOpenImages?: (urls: string[], index: number) => void;
}

/** Shows a solution in its saved order: text boxes and pictures exactly where they were placed */
export const SolutionView: React.FC<SolutionViewProps> = ({ text, imageIds, imageUrls, textClassName, onOpenImages }) => {
  const parts = useMemo(() => parseSolution(text, imageIds), [text, imageIds]);
  const allUrls = useMemo(
    () => parts.flatMap((p) => (p.kind === 'image' && imageUrls[p.id] ? [imageUrls[p.id]] : [])),
    [parts, imageUrls]
  );

  let imgCounter = -1;
  return (
    <div className="space-y-2">
      {parts.map((p, i) => {
        if (p.kind === 'text') {
          if (!p.text.trim()) return null;
          return (
            <RichText
              key={i}
              text={p.text}
              className={textClassName || 'text-xs text-[#1B1F2A] leading-relaxed'}
            />
          );
        }
        const url = imageUrls[p.id];
        if (!url) return null;
        imgCounter += 1;
        const idx = imgCounter;
        return (
          <div
            key={i}
            onClick={onOpenImages ? () => onOpenImages(allUrls, idx) : undefined}
            className={`w-full overflow-hidden rounded-xl border border-[#D5D9E2] bg-white ${
              onOpenImages ? 'cursor-pointer hover:opacity-95 transition-opacity' : ''
            }`}
          >
            <img src={url} alt="সমাধান চিত্র" className="w-full h-auto object-contain max-h-56 mx-auto" />
          </div>
        );
      })}
    </div>
  );
};

export default SolutionView;
