'use client';

import { useState, useRef, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import Toolbar from '@/components/Toolbar';
import EditorCanvas from '@/components/EditorCanvas';
import FileUpload from '@/components/FileUpload';
import Sidebar from '@/components/Sidebar';
import { loadPDF, createBlankPDF, savePDF, downloadPDF, applyFabricToPDF } from '@/lib/pdfUtils';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | ArrayBuffer | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [currentTool, setCurrentTool] = useState('select');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [fillColor, setFillColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [canvasInstance, setCanvasInstance] = useState<fabric.Canvas | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    try {
      const doc = await loadPDF(file);
      setPdfFile(file);
      setPdfDoc(doc);
      setNumPages(doc.getPageCount());
      setCurrentPage(1);
      setCurrentTool('select');
    } catch (error) {
      console.error('Error loading PDF:', error);
      alert('Failed to load PDF file');
    }
  };

  const handleNewPDF = async () => {
    try {
      const doc = await createBlankPDF(612, 792); // Standard US Letter size
      setPdfDoc(doc);
      setNumPages(1);
      setCurrentPage(1);
      setPdfFile(null); // No file for blank PDF
      setCurrentTool('select');
      // Canvas will initialize with default dimensions when it mounts
    } catch (error) {
      console.error('Error creating blank PDF:', error);
      alert('Failed to create new PDF');
    }
  };

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileSelect(file);
    }
  };

  const handleSave = async () => {
    if (!pdfDoc || !canvasInstance) {
      alert('No PDF loaded or canvas not ready');
      return;
    }

    try {
      // Apply fabric canvas changes to PDF
      await applyFabricToPDF(pdfDoc, currentPage - 1, canvasInstance);

      // Save and download
      const blob = await savePDF(pdfDoc);
      downloadPDF(blob, 'edited.pdf');
    } catch (error) {
      console.error('Error saving PDF:', error);
      alert('Failed to save PDF');
    }
  };

  const handleUndo = () => {
    if (canvasInstance && (canvasInstance as any).undo) {
      (canvasInstance as any).undo();
    }
  };

  const handleRedo = () => {
    if (canvasInstance && (canvasInstance as any).redo) {
      (canvasInstance as any).redo();
    }
  };

  const handleAddImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && canvasInstance) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageUrl = event.target?.result as string;
          if ((canvasInstance as any).addImage) {
            (canvasInstance as any).addImage(imageUrl);
          }
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleCanvasReady = (canvas: fabric.Canvas) => {
    setCanvasInstance(canvas);
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const hasPdf = pdfDoc !== null;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">PDF Craft</h1>
          <p className="text-sm text-gray-600 mt-1">
            Edit your PDF instantly — free, online, and private.
          </p>
        </div>
      </header>

      {/* Toolbar */}
      <Toolbar
        currentTool={currentTool}
        onToolChange={setCurrentTool}
        onUpload={handleUpload}
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onNewPDF={handleNewPDF}
        onAddImage={handleAddImage}
        canUndo={canUndo}
        canRedo={canRedo}
        hasPdf={hasPdf}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto">
          {!hasPdf ? (
            <div className="w-full max-w-2xl">
              <FileUpload
                onFileSelect={handleFileSelect}
                onNewPDF={handleNewPDF}
              />
            </div>
          ) : (
            <div className="w-full max-w-5xl">
              <EditorCanvas
                pdfFile={pdfFile}
                currentPage={currentPage}
                tool={currentTool}
                strokeColor={strokeColor}
                fillColor={fillColor}
                strokeWidth={strokeWidth}
                fontSize={fontSize}
                fontFamily={fontFamily}
                onCanvasReady={handleCanvasReady}
                onObjectAdded={() => {}}
                onObjectRemoved={() => {}}
              />
              
              {/* Page Navigation */}
              {numPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {numPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                    disabled={currentPage === numPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <Sidebar
          strokeColor={strokeColor}
          fillColor={fillColor}
          strokeWidth={strokeWidth}
          fontSize={fontSize}
          fontFamily={fontFamily}
          onStrokeColorChange={setStrokeColor}
          onFillColorChange={setFillColor}
          onStrokeWidthChange={setStrokeWidth}
          onFontSizeChange={setFontSize}
          onFontFamilyChange={setFontFamily}
          isOpen={sidebarOpen && hasPdf}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Settings Toggle */}
      {hasPdf && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Settings className="h-5 w-5" />
        </Button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  );
}

