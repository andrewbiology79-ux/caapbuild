/**
 * Image compressor utility using HTML5 Canvas
 * Resizes image if width > maxDimension (default 800px) proportionally
 * Exports as WebP Blob (quality 0.8)
 */
export async function compressImageToWebP(
  file: File,
  maxWidth = 800,
  quality = 0.8
): Promise<{ blob: Blob; fileName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas 2d context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const baseName = file.name.replace(/\.[^/.]+$/, '');
              resolve({
                blob,
                fileName: `${baseName}.webp`,
              });
            } else {
              // Fallback to original file
              resolve({
                blob: file,
                fileName: file.name,
              });
            }
          },
          'image/webp',
          quality
        );
      };

      img.onerror = (err) => reject(err);
      img.src = e.target?.result as string;
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
