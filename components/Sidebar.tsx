'use client';

import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { X } from 'lucide-react';

interface SidebarProps {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  onStrokeColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onFontSizeChange: (size: number) => void;
  onFontFamilyChange: (family: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const fontFamilies = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Georgia',
  'Palatino',
  'Garamond',
  'Comic Sans MS',
  'Trebuchet MS',
];

export default function Sidebar({
  strokeColor,
  fillColor,
  strokeWidth,
  fontSize,
  fontFamily,
  onStrokeColorChange,
  onFillColorChange,
  onStrokeWidthChange,
  onFontSizeChange,
  onFontFamilyChange,
  isOpen,
  onClose,
}: SidebarProps) {
  if (!isOpen) return null;

  return (
    <div className="w-64 bg-gray-100 border-l border-gray-300 p-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Properties</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-6">
        {/* Stroke Color */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Stroke Color
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={strokeColor}
              onChange={(e) => onStrokeColorChange(e.target.value)}
              className="h-10 w-20 p-1 cursor-pointer"
            />
            <Input
              type="text"
              value={strokeColor}
              onChange={(e) => onStrokeColorChange(e.target.value)}
              className="flex-1"
              placeholder="#000000"
            />
          </div>
        </div>

        {/* Fill Color */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Fill Color
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={fillColor}
              onChange={(e) => onFillColorChange(e.target.value)}
              className="h-10 w-20 p-1 cursor-pointer"
            />
            <Input
              type="text"
              value={fillColor}
              onChange={(e) => onFillColorChange(e.target.value)}
              className="flex-1"
              placeholder="#ffffff"
            />
          </div>
        </div>

        {/* Stroke Width */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Stroke Width: {strokeWidth}px
          </Label>
          <Slider
            value={[strokeWidth]}
            onValueChange={(values) => onStrokeWidthChange(values[0])}
            min={1}
            max={20}
            step={1}
            className="w-full"
          />
        </div>

        {/* Font Size */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Font Size: {fontSize}px
          </Label>
          <Slider
            value={[fontSize]}
            onValueChange={(values) => onFontSizeChange(values[0])}
            min={8}
            max={72}
            step={1}
            className="w-full"
          />
        </div>

        {/* Font Family */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Font Family
          </Label>
          <select
            value={fontFamily}
            onChange={(e) => onFontFamilyChange(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {fontFamilies.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

