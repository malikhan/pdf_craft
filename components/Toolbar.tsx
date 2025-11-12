'use client';

import {
  Upload,
  Type,
  Image as ImageIcon,
  Pencil,
  Highlighter,
  Eraser,
  Save,
  Undo,
  Redo,
  Square,
  Circle,
  ArrowRight,
  FilePlus,
  MousePointer2,
  Edit,
} from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface ToolbarProps {
  currentTool: string;
  onToolChange: (tool: string) => void;
  onUpload: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onNewPDF: () => void;
  onAddImage: () => void;
  onEditMode: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasPdf: boolean;
  editMode: boolean;
}

export default function Toolbar({
  currentTool,
  onToolChange,
  onUpload,
  onSave,
  onUndo,
  onRedo,
  onNewPDF,
  onAddImage,
  onEditMode,
  canUndo,
  canRedo,
  hasPdf,
  editMode,
}: ToolbarProps) {
  const tools = [
    { id: 'select', label: 'Select', icon: MousePointer2, disabled: false },
    { id: 'upload', label: 'Upload', icon: Upload, action: onUpload },
    { id: 'new', label: 'New PDF', icon: FilePlus, action: onNewPDF },
    { id: 'edit', label: editMode ? 'Exit Edit' : 'Edit PDF', icon: Edit, action: onEditMode, disabled: !hasPdf },
    { id: 'text', label: 'Add Text', icon: Type, disabled: !hasPdf },
    { id: 'image', label: 'Add Image', icon: ImageIcon, action: onAddImage, disabled: !hasPdf },
    { id: 'rectangle', label: 'Rectangle', icon: Square, disabled: !hasPdf },
    { id: 'circle', label: 'Circle', icon: Circle, disabled: !hasPdf },
    { id: 'arrow', label: 'Arrow', icon: ArrowRight, disabled: !hasPdf },
    { id: 'draw', label: 'Draw', icon: Pencil, disabled: !hasPdf },
    { id: 'highlight', label: 'Highlight', icon: Highlighter, disabled: !hasPdf },
    { id: 'erase', label: 'Erase', icon: Eraser, disabled: !hasPdf },
    { id: 'undo', label: 'Undo', icon: Undo, action: onUndo, disabled: !canUndo || !hasPdf },
    { id: 'redo', label: 'Redo', icon: Redo, action: onRedo, disabled: !canRedo || !hasPdf },
    { id: 'save', label: 'Save PDF', icon: Save, action: onSave, disabled: !hasPdf },
  ];

  return (
    <div className="w-full bg-gray-900 text-white px-4 py-3 shadow-lg">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = currentTool === tool.id && !tool.action;
          const isDisabled = tool.disabled;

          if (tool.action) {
            return (
              <Button
                key={tool.id}
                variant="ghost"
                size="icon"
                onClick={tool.action}
                disabled={isDisabled}
                className={cn(
                  'h-10 w-10 text-white hover:bg-gray-800',
                  isDisabled && 'opacity-50 cursor-not-allowed'
                )}
                title={tool.label}
              >
                <Icon className="h-5 w-5" />
              </Button>
            );
          }

          return (
            <Button
              key={tool.id}
              variant="ghost"
              size="icon"
              onClick={() => onToolChange(tool.id)}
              disabled={isDisabled}
              className={cn(
                'h-10 w-10 text-white hover:bg-gray-800',
                isActive && 'bg-gray-700',
                isDisabled && 'opacity-50 cursor-not-allowed'
              )}
              title={tool.label}
            >
              <Icon className="h-5 w-5" />
            </Button>
          );
        })}
      </div>
    </div>
  );
}

