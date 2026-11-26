import React from 'react';
import type { ParticipantStageConfig } from '../../shared/types';
import { SlideBuilderModal } from './SlideBuilderModal';

interface StudioLayoutModalProps {
  open: boolean;
  onClose: () => void;
  stageConfig: ParticipantStageConfig;
  onSave: (next: Partial<ParticipantStageConfig>) => void;
}

/**
 * Studio Layout Customizer powered by the full Canva-style SlideBuilderModal canvas
 * (shapes, frames, stickers, icons, .glb 3D models, 3D PNGs, text, backgrounds, layers)
 * plus draggable Presentation and Speaker/Camera boxes.
 */
export const StudioLayoutModal: React.FC<StudioLayoutModalProps> = ({
  open,
  onClose,
  stageConfig,
  onSave
}) => {
  return (
    <SlideBuilderModal
      open={open}
      initialItem={null}
      onClose={onClose}
      onSave={() => {}}
      studioMode={{
        stageConfig,
        onSaveStudio: (next) => {
          onSave(next);
        }
      }}
    />
  );
};
