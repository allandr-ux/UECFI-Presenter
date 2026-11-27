import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Upload, X } from 'lucide-react';
import { useSavedBgImages } from '../utils/bgImageStore';
import { saveUserMediaFile } from '../utils/mediaUpload';
import { cn } from '../utils/cn';

interface BackgroundImagePickerProps {
  value?: string;
  onSelect: (cssValue: string) => void;
  compact?: boolean;
}

/**
 * Reusable background image control: lets the user upload a new image
 * (persisted globally to IndexedDB) or pick from previously uploaded images.
 */
export const BackgroundImagePicker: React.FC<BackgroundImagePickerProps> = ({
  value,
  onSelect,
  compact = false
}) => {
  const { images, saveImage, deleteImage } = useSavedBgImages();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mediaUrl = await saveUserMediaFile(file);
    const saved = await saveImage(file.name, mediaUrl);
    onSelect(saved.cssValue);
    setGalleryOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-[5px]">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Upload a new background image"
          className={cn(
            'inline-flex items-center gap-1 border border-subtle font-semibold text-text-primary transition-colors hover:bg-hover',
            compact
              ? 'rounded-md bg-app px-[7px] py-[3px] text-[0.7rem]'
              : 'rounded-[7px] bg-panel-elevated px-2.5 py-[5px] text-[0.76rem]'
          )}
        >
          <Upload size={compact ? 11 : 13} />
          Upload
        </button>

        {images.length > 0 && (
          <button
            type="button"
            onClick={() => setGalleryOpen((prev) => !prev)}
            title="Choose from saved background images"
            className={cn(
              'inline-flex items-center gap-1 border font-semibold text-text-primary transition-colors',
              compact
                ? 'rounded-md px-[7px] py-[3px] text-[0.7rem]'
                : 'rounded-[7px] px-2.5 py-[5px] text-[0.76rem]',
              galleryOpen
                ? 'border-accent bg-blue-500/16'
                : compact
                ? 'border-subtle bg-app hover:bg-hover'
                : 'border-subtle bg-panel-elevated hover:bg-hover'
            )}
          >
            <ImageIcon size={compact ? 11 : 13} />
            Saved ({images.length})
          </button>
        )}
      </div>

      {galleryOpen && images.length > 0 && (
        <div
          className={cn(
            'grid max-h-[148px] gap-1.5 overflow-y-auto rounded-lg border border-subtle bg-app p-2',
            compact ? 'grid-cols-3' : 'grid-cols-[repeat(auto-fill,minmax(64px,1fr))]'
          )}
        >
          {images.map((img) => {
            const isSelected = value === img.cssValue;
            return (
              <div
                key={img.id}
                className={cn(
                  'relative aspect-[16/10] overflow-hidden rounded-md',
                  isSelected ? 'border-2 border-accent' : 'border border-subtle'
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(img.cssValue)}
                  title={img.name}
                  className="block h-full w-full border-0 p-0"
                  style={{ background: `url("${img.dataUrl}") center/cover no-repeat` }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteImage(img.id);
                  }}
                  title={`Remove ${img.name}`}
                  className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-0 bg-black/70 p-0 text-white hover:bg-black/90"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
