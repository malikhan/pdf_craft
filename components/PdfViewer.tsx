'use client';

import { Document, Page, pdfjs } from 'react-pdf';
import { useState, useEffect } from 'react';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set up PDF.js worker - use local file to avoid CORS issues
if (typeof window !== 'undefined') {
  // Use local worker file from public folder (.mjs is the correct format for pdfjs-dist v4.8.69)
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface PdfViewerProps {
  file: File | ArrayBuffer | null;
  pageNumber: number;
  scale?: number;
  onPageLoad?: (page: any) => void;
  className?: string;
  renderTextLayer?: boolean;
}

export default function PdfViewer({
  file,
  pageNumber,
  scale = 1.5,
  onPageLoad,
  className = '',
  renderTextLayer = false,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
  }, [file]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
  }

  function onDocumentLoadError(error: Error) {
    setError(error.message);
    setLoading(false);
  }

  if (!file) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg ${className}`}>
        <p className="text-gray-500">No PDF loaded</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-red-50 border-2 border-red-300 rounded-lg ${className}`}>
        <p className="text-red-500">Error loading PDF: {error}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center ${className}`} style={{ pointerEvents: 'none' }}>
      <Document
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={
          <div className="flex items-center justify-center p-8">
            <p className="text-gray-500">Loading PDF...</p>
          </div>
        }
        className="flex justify-center"
      >
        <Page
          pageNumber={pageNumber}
          scale={scale}
          renderTextLayer={renderTextLayer}
          renderAnnotationLayer={false}
          onLoadSuccess={onPageLoad}
          className="shadow-lg"
        />
      </Document>
      {numPages > 0 && (
        <p className="mt-2 text-sm text-gray-500">
          Page {pageNumber} of {numPages}
        </p>
      )}
    </div>
  );
}

