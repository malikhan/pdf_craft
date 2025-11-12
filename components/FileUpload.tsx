'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';
import { Button } from './ui/button';
import { isValidPDFFile } from '@/lib/fileUtils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onNewPDF?: () => void;
  className?: string;
}

export default function FileUpload({ onFileSelect, onNewPDF, className = '' }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file && isValidPDFFile(file)) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  });

  const handleRemove = () => {
    setSelectedFile(null);
  };

  const handleNewPDF = () => {
    if (onNewPDF) {
      onNewPDF();
    }
  };

  if (selectedFile) {
    return (
      <div className={`flex items-center gap-2 p-4 bg-gray-50 rounded-lg border ${className}`}>
        <File className="w-5 h-5 text-gray-600" />
        <span className="flex-1 text-sm text-gray-700 truncate">{selectedFile.name}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRemove}
          className="h-8 w-8"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-sm text-gray-600 mb-2">
          {isDragActive ? 'Drop PDF here' : 'Drag & drop a PDF file here, or click to select'}
        </p>
        <p className="text-xs text-gray-500 mb-4">PDF files only</p>
        {onNewPDF && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleNewPDF();
            }}
            className="mt-2"
          >
            Create New PDF
          </Button>
        )}
      </div>
    </div>
  );
}

