'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import PdfViewer from './PdfViewer';

// Ensure fabric is available
if (typeof window !== 'undefined' && !(window as any).fabric) {
  (window as any).fabric = fabric;
}

interface EditorCanvasProps {
  pdfFile: File | ArrayBuffer | null;
  currentPage: number;
  tool: string;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  onCanvasReady?: (canvas: fabric.Canvas) => void;
  onObjectAdded?: () => void;
  onObjectRemoved?: () => void;
}

export default function EditorCanvas({
  pdfFile,
  currentPage,
  tool,
  strokeColor,
  fillColor,
  strokeWidth,
  fontSize,
  fontFamily,
  onCanvasReady,
  onObjectAdded,
  onObjectRemoved,
}: EditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfWrapperRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Initialize fabric canvas when ref becomes available
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let retryCount = 0;
    const maxRetries = 100; // 10 seconds max (100 * 100ms)

    const initCanvas = () => {
      if (!canvasRef.current) {
        retryCount++;
        if (retryCount < maxRetries) {
          return false;
        }
        // If we've tried many times, check if canvas element exists in DOM
        console.warn('Canvas ref still not available after many retries');
        return false;
      }

      // Don't reinitialize if already initialized
      if (fabricCanvasRef.current) {
        console.log('Canvas already initialized');
        return true;
      }

      console.log('Initializing fabric canvas...');

      const defaultWidth = 918;
      const defaultHeight = 1188;
      
      try {
        const canvas = new fabric.Canvas(canvasRef.current, {
          width: defaultWidth,
          height: defaultHeight,
          backgroundColor: 'transparent',
          preserveObjectStacking: true,
        });

        console.log('Fabric canvas created:', canvas);
        fabricCanvasRef.current = canvas;
        
        if (!pdfFile && !pdfDimensions) {
          setPdfDimensions({ width: defaultWidth, height: defaultHeight });
        }

        if (onCanvasReady) {
          onCanvasReady(canvas);
        }

        // Save initial state
        const saveState = () => {
          if (!fabricCanvasRef.current) return;
          const json = JSON.stringify(fabricCanvasRef.current.toJSON());
          setHistory((prev) => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push(json);
            setHistoryIndex(newHistory.length - 1);
            return newHistory;
          });
        };

        saveState();

        // Event listeners
        canvas.on('object:added', () => {
          saveState();
          if (onObjectAdded) onObjectAdded();
        });

        canvas.on('object:removed', () => {
          saveState();
          if (onObjectRemoved) onObjectRemoved();
        });

        canvas.on('object:modified', () => {
          saveState();
        });

        // Clear any pending retries
        if (intervalId) clearInterval(intervalId);
        if (timeoutId) clearTimeout(timeoutId);
        
        return true;
      } catch (error) {
        console.error('Error initializing canvas:', error);
        return false;
      }
    };

    // Try immediately
    if (!initCanvas()) {
      // Retry with intervals until canvas is available
      intervalId = setInterval(() => {
        if (initCanvas() || retryCount >= maxRetries) {
          if (intervalId) clearInterval(intervalId);
        }
      }, 100);

      // Extended timeout - 15 seconds
      timeoutId = setTimeout(() => {
        if (intervalId) clearInterval(intervalId);
        if (!fabricCanvasRef.current) {
          console.warn('Canvas initialization timeout after 15 seconds. Canvas element may not be in DOM.');
        }
      }, 15000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
    };
  }, []);

  // Update canvas dimensions when PDF loads
  useEffect(() => {
    if (!fabricCanvasRef.current || !pdfDimensions) return;

    const canvas = fabricCanvasRef.current;
    canvas.setWidth(pdfDimensions.width);
    canvas.setHeight(pdfDimensions.height);
    canvas.calcOffset();
    canvas.renderAll();
  }, [pdfDimensions]);

  // Handle tool changes
  useEffect(() => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;

    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.defaultCursor = 'default';

    switch (tool) {
      case 'select':
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        break;

      case 'text':
        canvas.selection = true;
        canvas.defaultCursor = 'text';
        break;

      case 'draw':
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush.width = strokeWidth;
        canvas.freeDrawingBrush.color = strokeColor;
        canvas.defaultCursor = 'crosshair';
        break;

      case 'highlight':
        canvas.isDrawingMode = true;
        const highlightBrush = new fabric.PencilBrush(canvas);
        highlightBrush.width = strokeWidth * 2;
        highlightBrush.color = strokeColor + '80';
        canvas.freeDrawingBrush = highlightBrush;
        canvas.defaultCursor = 'crosshair';
        break;

      case 'erase':
        canvas.selection = true;
        canvas.defaultCursor = 'not-allowed';
        break;

      case 'rectangle':
      case 'circle':
      case 'arrow':
        canvas.selection = true;
        canvas.defaultCursor = 'crosshair';
        break;
    }

    canvas.renderAll();
  }, [tool, strokeColor, strokeWidth]);

  const handlePageLoad = useCallback((page: any) => {
    if (page) {
      const viewport = page.getViewport({ scale: 1.5 });
      const dimensions = {
        width: viewport.width,
        height: viewport.height,
      };
      setPdfDimensions(dimensions);
      
      // Wait for PDF to render, then resize canvas
      setTimeout(() => {
        if (fabricCanvasRef.current) {
          const canvas = fabricCanvasRef.current;
          canvas.setWidth(dimensions.width);
          canvas.setHeight(dimensions.height);
          canvas.calcOffset();
          canvas.renderAll();
          console.log('Canvas resized to:', dimensions.width, dimensions.height);
        }
      }, 300);
    }
  }, []);

  const handleCanvasClick = useCallback((e: fabric.IEvent) => {
    if (!fabricCanvasRef.current) {
      console.log('Canvas not ready');
      return;
    }
    
    console.log('Canvas clicked, tool:', tool);
    
    e.e?.preventDefault?.();
    e.e?.stopPropagation?.();

    const canvas = fabricCanvasRef.current;
    const pointer = canvas.getPointer(e.e);

    switch (tool) {
      case 'text':
        const text = new fabric.Textbox('Enter text', {
          left: pointer.x,
          top: pointer.y,
          width: 200,
          fontSize: fontSize,
          fontFamily: fontFamily,
          fill: fillColor,
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.renderAll();
        setTimeout(() => {
          text.enterEditing();
        }, 50);
        break;

      case 'rectangle':
        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 100,
          height: 100,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        });
        canvas.add(rect);
        canvas.renderAll();
        break;

      case 'circle':
        const circle = new fabric.Circle({
          left: pointer.x,
          top: pointer.y,
          radius: 50,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        });
        canvas.add(circle);
        canvas.renderAll();
        break;

      case 'arrow':
        const arrow = new fabric.Path(
          `M ${pointer.x} ${pointer.y} L ${pointer.x + 100} ${pointer.y}`,
          {
            fill: '',
            stroke: strokeColor,
            strokeWidth: strokeWidth,
          }
        );
        canvas.add(arrow);
        canvas.renderAll();
        break;

      case 'erase':
        const obj = canvas.findTarget(e.e, false);
        if (obj && obj !== canvas) {
          canvas.remove(obj);
          canvas.renderAll();
        }
        break;
    }
  }, [tool, strokeColor, fillColor, strokeWidth, fontSize, fontFamily]);

  // Attach click handlers - wait for canvas to be ready
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let nativeClickHandler: ((e: MouseEvent) => void) | null = null;

    const attachHandlers = () => {
      if (!fabricCanvasRef.current) {
        console.log('Canvas not available for attaching handlers');
        return;
      }

      const canvas = fabricCanvasRef.current;
      const canvasElement = canvas.getElement();

      if (!canvasElement) {
        console.log('Canvas element not found');
        return;
      }

      console.log('Canvas is ready, attaching handlers for tool:', tool);
      console.log('Canvas element:', canvasElement);
      console.log('Canvas dimensions:', canvas.width, canvas.height);

      // Remove all previous handlers
      canvas.off('mouse:down');
      if (nativeClickHandler) {
        canvasElement.removeEventListener('click', nativeClickHandler);
      }

      if (tool === 'text' || tool === 'rectangle' || tool === 'circle' || tool === 'arrow' || tool === 'erase') {
        // Also add native click listener as backup
        nativeClickHandler = (e: MouseEvent) => {
          console.log('Native click detected on canvas!', e);
          const fabricEvent = {
            e: e,
          } as fabric.IEvent;
          handleCanvasClick(fabricEvent);
        };
        
        canvas.on('mouse:down', handleCanvasClick);
        canvasElement.addEventListener('click', nativeClickHandler);
      }
    };

    // Try immediately, then with delay
    if (fabricCanvasRef.current) {
      attachHandlers();
    } else {
      timeoutId = setTimeout(attachHandlers, 200);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (fabricCanvasRef.current) {
        const canvas = fabricCanvasRef.current;
        const canvasElement = canvas.getElement();
        canvas.off('mouse:down', handleCanvasClick);
        if (nativeClickHandler && canvasElement) {
          canvasElement.removeEventListener('click', nativeClickHandler);
        }
      }
    };
  }, [tool, handleCanvasClick]);

  const undo = () => {
    if (!fabricCanvasRef.current || historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    fabricCanvasRef.current.loadFromJSON(history[newIndex], () => {
      fabricCanvasRef.current?.renderAll();
    });
    setHistoryIndex(newIndex);
  };

  const redo = () => {
    if (!fabricCanvasRef.current || historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    fabricCanvasRef.current.loadFromJSON(history[newIndex], () => {
      fabricCanvasRef.current?.renderAll();
    });
    setHistoryIndex(newIndex);
  };

  useEffect(() => {
    if (fabricCanvasRef.current) {
      (fabricCanvasRef.current as any).undo = undo;
      (fabricCanvasRef.current as any).redo = redo;
    }
  }, [historyIndex, history]);

  const addImage = (imageUrl: string) => {
    if (!fabricCanvasRef.current) return;
    fabric.Image.fromURL(imageUrl, (img) => {
      img.scaleToWidth(200);
      img.set({ left: 100, top: 100 });
      fabricCanvasRef.current?.add(img);
      fabricCanvasRef.current?.renderAll();
    });
  };

  useEffect(() => {
    if (fabricCanvasRef.current) {
      (fabricCanvasRef.current as any).addImage = addImage;
    }
  }, []);

  // Blank PDF view
  if (!pdfFile && pdfDimensions) {
    return (
      <div className="relative flex items-center justify-center bg-gray-50 p-4 rounded-lg shadow-inner">
        <div ref={containerRef} className="relative">
          <div className="relative bg-white border border-gray-300" style={{ width: pdfDimensions.width, height: pdfDimensions.height }}>
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0"
              style={{ pointerEvents: 'auto', zIndex: 10 }}
            />
          </div>
        </div>
      </div>
    );
  }

  // PDF view with overlay canvas
  return (
    <div className="relative flex items-center justify-center bg-gray-50 p-4 rounded-lg shadow-inner">
      <div ref={containerRef} className="relative inline-block">
        <div ref={pdfWrapperRef} className="relative">
          {pdfFile ? (
            <PdfViewer
              file={pdfFile}
              pageNumber={currentPage}
              scale={1.5}
              onPageLoad={handlePageLoad}
              className="z-0"
            />
          ) : (
            <div className="flex items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-lg" style={{ minWidth: '612px', minHeight: '792px' }}>
              <p className="text-gray-500">No PDF loaded</p>
            </div>
          )}
          {/* Canvas overlay - positioned to match PDF */}
          {pdfDimensions && (
            <div
              className="absolute"
              style={{
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: pdfDimensions.width,
                height: pdfDimensions.height,
                pointerEvents: 'none',
                zIndex: 1000,
              }}
            >
              <canvas
                ref={canvasRef}
                style={{ 
                  pointerEvents: 'auto',
                  cursor: tool === 'text' ? 'text' : tool === 'draw' || tool === 'highlight' ? 'crosshair' : tool === 'erase' ? 'not-allowed' : 'default',
                  display: 'block',
                  border: '2px solid red', // Temporary border to see if canvas is visible
                  width: '100%',
                  height: '100%',
                }}
                width={pdfDimensions.width}
                height={pdfDimensions.height}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Export helper functions
export function getCanvasInstance(canvas: fabric.Canvas | null): {
  undo: () => void;
  redo: () => void;
  addImage: (url: string) => void;
} | null {
  if (!canvas) return null;
  return {
    undo: (canvas as any).undo || (() => {}),
    redo: (canvas as any).redo || (() => {}),
    addImage: (canvas as any).addImage || (() => {}),
  };
}
