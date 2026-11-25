import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Upload, X } from 'lucide-react';
import { useSavedBgImages } from '../utils/bgImageStore';
import { saveUserMediaFile } from '../utils/mediaUpload';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Upload a new background image"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: compact ? '3px 7px' : '5px 10px',
            borderRadius: compact ? '6px' : '7px',
            border: '1px solid var(--border-subtle)',
            background: compact ? 'var(--bg-app)' : 'var(--bg-panel-elevated)',
            color: 'var(--text-primary)',
            fontSize: compact ? '0.7rem' : '0.76rem',
            fontWeight: 600
          }}
        >
          <Upload size={compact ? 11 : 13} />
          Upload
        </button>

        {images.length > 0 && (
          <button
            type="button"
            onClick={() => setGalleryOpen((prev) => !prev)}
            title="Choose from saved background images"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: compact ? '3px 7px' : '5px 10px',
              borderRadius: compact ? '6px' : '7px',
              border: '1px solid',
              borderColor: galleryOpen ? 'var(--accent)' : 'var(--border-subtle)',
              background: galleryOpen
                ? 'rgba(59,130,246,0.16)'
                : compact
                ? 'var(--bg-app)'
                : 'var(--bg-panel-elevated)',
              color: 'var(--text-primary)',
              fontSize: compact ? '0.7rem' : '0.76rem',
              fontWeight: 600
            }}
          >
            <ImageIcon size={compact ? 11 : 13} />
            Saved ({images.length})
          </button>
        )}
      </div>

      {galleryOpen && images.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(64px, 1fr))',
            gap: '6px',
            padding: '8px',
            borderRadius: '8px',
            background: 'var(--bg-app)',
            border: '1px solid var(--border-subtle)',
            maxHeight: '148px',
            overflowY: 'auto'
          }}
        >
          {images.map((img) => {
            const isSelected = value === img.cssValue;
            return (
              <div
                key={img.id}
                style={{
                  position: 'relative',
                  aspectRatio: '16 / 10',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-subtle)'
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(img.cssValue)}
                  title={img.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    padding: 0,
                    border: 'none',
                    background: `url("${img.dataUrl}") center/cover no-repeat`,
                    display: 'block'
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteImage(img.id);
                  }}
                  title={`Remove ${img.name}`}
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '999px',
                    border: 'none',
                    background: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
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
