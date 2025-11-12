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
  editMode = false,
}: EditorCanvasProps & { editMode?: boolean }) {
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

      // Check if fabric canvas is already initialized and attached to this element
      if (fabricCanvasRef.current) {
        // Check if the canvas element matches
        const currentElement = fabricCanvasRef.current.getElement();
        if (currentElement === canvasRef.current) {
          console.log('Canvas already initialized on correct element');
          return true;
        } else {
          // Canvas element changed, need to reinitialize
          console.log('Canvas element changed, disposing old canvas and reinitializing');
          
          // Safely dispose of the old canvas
          try {
            const oldCanvas = fabricCanvasRef.current;
            // Check if the old element is still in the DOM before disposing
            const oldElement = oldCanvas.getElement();
            
            if (oldElement) {
              // Check if element is still attached to DOM
              let isInDOM = false;
              try {
                isInDOM = oldElement.parentNode !== null || 
                         document.body.contains(oldElement) ||
                         document.contains(oldElement);
              } catch (e) {
                // If contains() throws, element is likely being removed
                isInDOM = false;
              }
              
              if (isInDOM) {
                // Element is still in DOM, but be careful - React might be removing it
                // Just remove event listeners and clear, don't call dispose() which manipulates DOM
                console.log('Old canvas element in DOM, cleaning up without dispose');
                oldCanvas.off();
                oldCanvas.clear();
                // Manually clear internal references to prevent DOM manipulation
                try {
                  if ((oldCanvas as any).lowerCanvasEl && (oldCanvas as any).lowerCanvasEl.parentNode) {
                    // Only remove if still has parent
                    (oldCanvas as any).lowerCanvasEl = null;
                  }
                  if ((oldCanvas as any).upperCanvasEl && (oldCanvas as any).upperCanvasEl.parentNode) {
                    (oldCanvas as any).upperCanvasEl = null;
                  }
                } catch (e) {
                  // Ignore errors when clearing references
                }
              } else {
                // Element is not in DOM, manually clean up without DOM manipulation
                console.log('Old canvas element not in DOM, cleaning up manually');
                oldCanvas.off();
                oldCanvas.clear();
                // Clear internal references
                try {
                  (oldCanvas as any).lowerCanvasEl = null;
                  (oldCanvas as any).upperCanvasEl = null;
                  (oldCanvas as any).containerClass = null;
                } catch (e) {
                  // Ignore errors
                }
              }
            } else {
              // No element reference, just clear
              oldCanvas.off();
              oldCanvas.clear();
            }
          } catch (error) {
            console.warn('Error disposing old canvas:', error);
            // Continue anyway - just clear the reference
            if (fabricCanvasRef.current) {
              try {
                fabricCanvasRef.current.off();
                fabricCanvasRef.current.clear();
              } catch (e) {
                // Ignore cleanup errors
              }
            }
          }
          fabricCanvasRef.current = null;
        }
      }

      console.log('Initializing fabric canvas on element:', canvasRef.current);

      const defaultWidth = 918;
      const defaultHeight = 1188;
      
      try {
        const canvas = new fabric.Canvas(canvasRef.current, {
          width: defaultWidth,
          height: defaultHeight,
          backgroundColor: 'transparent',
          preserveObjectStacking: true,
          imageSmoothingEnabled: true, // Enable smoothing for better quality
        });
        
        // Ensure crisp text rendering
        const lowerCanvasEl = canvas.lowerCanvasEl;
        if (lowerCanvasEl) {
          const ctx = lowerCanvasEl.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
          }
        }

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

    // Reset retry count when editMode changes
    retryCount = 0;

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
      // Don't dispose canvas on unmount, as we want to keep it when switching modes
      // if (fabricCanvasRef.current) {
      //   fabricCanvasRef.current.dispose();
      //   fabricCanvasRef.current = null;
      // }
    };
  }, [editMode, pdfFile]); // Re-run when editMode or pdfFile changes to ensure canvas is initialized

  // Cleanup canvas when editMode changes (before new element is created)
  useEffect(() => {
    return () => {
      // This cleanup runs before the component re-renders with new editMode
      if (fabricCanvasRef.current) {
        const canvas = fabricCanvasRef.current;
        try {
          const element = canvas.getElement();
          
          // If element is about to be removed, clean up safely
          if (element) {
            // Check if element is still in DOM
            const isInDOM = element.parentNode !== null;
            
            if (isInDOM) {
              // Element still in DOM, just clear objects and remove listeners
              canvas.off();
              canvas.clear();
            } else {
              // Element already removed, just clear references
              canvas.off();
            }
          } else {
            // No element, just clear references
            canvas.off();
          }
        } catch (error) {
          console.warn('Error cleaning up canvas before mode change:', error);
          // Try to clear anyway
          try {
            canvas.off();
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      }
    };
  }, [editMode]);

  // Clear canvas when page changes (but not in edit mode, as edit mode handles its own content)
  useEffect(() => {
    if (fabricCanvasRef.current && !editMode) {
      const canvas = fabricCanvasRef.current;
      canvas.clear();
      canvas.renderAll();
    }
  }, [currentPage, editMode]);

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

  // Update selected object properties when sidebar values change
  useEffect(() => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    const activeObject = canvas.getActiveObject();

    if (!activeObject) return;

    // Update text objects
    if (activeObject.type === 'textbox' || activeObject.type === 'text' || activeObject.type === 'i-text') {
      const textObj = activeObject as fabric.Textbox;
      
      // Normalize color to ensure proper format
      const textColor = strokeColor && strokeColor.trim() !== '' 
        ? (strokeColor.startsWith('#') ? strokeColor : `#${strokeColor}`)
        : '#000000';
      
      textObj.set({
        fontSize: fontSize,
        fontFamily: fontFamily,
        fill: textColor,
      });
      
      canvas.renderAll();
    }
    // Update shape objects (rectangles, circles, etc.)
    else if (activeObject.type === 'rect' || activeObject.type === 'circle' || activeObject.type === 'path') {
      activeObject.set({
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        fill: fillColor,
      });
      
      canvas.renderAll();
    }
  }, [fontSize, fontFamily, strokeColor, fillColor, strokeWidth]);

  const handlePageLoad = useCallback((page: any) => {
    if (page) {
      const viewport = page.getViewport({ scale: 1.5 });
      const dimensions = {
        width: viewport.width,
        height: viewport.height,
      };
      setPdfDimensions(dimensions);
      
      // Wait for PDF to render, then resize canvas and position it correctly
      setTimeout(() => {
        if (fabricCanvasRef.current) {
          const canvas = fabricCanvasRef.current;
          canvas.setWidth(dimensions.width);
          canvas.setHeight(dimensions.height);
          canvas.calcOffset();
          canvas.renderAll();
          console.log('Canvas resized to:', dimensions.width, dimensions.height);
          
          // Position canvas overlay to match PDF canvas exactly
          // Wait a bit more for PDF to fully render
          setTimeout(() => {
            const pdfCanvas = document.querySelector('.react-pdf__Page canvas') as HTMLCanvasElement;
            const canvasOverlay = canvas.getElement().parentElement;
            if (pdfCanvas && canvasOverlay) {
              const pdfCanvasRect = pdfCanvas.getBoundingClientRect();
              const pdfPageContainer = pdfCanvas.closest('.react-pdf__Page') as HTMLElement;
              const pdfWrapper = pdfPageContainer?.parentElement;
              
              if (pdfPageContainer && pdfWrapper) {
                const pageRect = pdfPageContainer.getBoundingClientRect();
                const wrapperRect = pdfWrapper.getBoundingClientRect();
                
                // Calculate position relative to wrapper (which contains both PDF and canvas)
                const pdfOffsetX = pdfCanvasRect.left - wrapperRect.left;
                const pdfOffsetY = pdfCanvasRect.top - wrapperRect.top;
                
                // Position canvas overlay to match PDF canvas exactly
                (canvasOverlay as HTMLElement).style.position = 'absolute';
                (canvasOverlay as HTMLElement).style.left = `${pdfOffsetX}px`;
                (canvasOverlay as HTMLElement).style.top = `${pdfOffsetY}px`;
                console.log('Canvas positioned to match PDF:', { 
                  pdfOffsetX: pdfOffsetX.toFixed(2), 
                  pdfOffsetY: pdfOffsetY.toFixed(2),
                  pdfCanvasSize: { width: pdfCanvasRect.width, height: pdfCanvasRect.height },
                  canvasSize: { width: dimensions.width, height: dimensions.height },
                });
              }
            }
          }, 200);
        }
      }, 500);
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
        // Normalize color to ensure pure black (#000000) format
        const textColor = strokeColor && strokeColor.trim() !== '' 
          ? (strokeColor.startsWith('#') ? strokeColor : `#${strokeColor}`)
          : '#000000';
        const text = new fabric.Textbox('', {
          left: pointer.x,
          top: pointer.y,
          width: 200,
          fontSize: fontSize,
          fontFamily: fontFamily,
          fill: textColor, // Use strokeColor for text (defaults to black) instead of fillColor (defaults to white)
          opacity: 1, // Ensure full opacity for crisp, solid black text
          stroke: '', // No stroke to avoid making text appear bold
          strokeWidth: 0, // No stroke width
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

  // Use a single canvas element that's always rendered to avoid React unmounting issues
  // The canvas stays in the DOM, we just reposition it based on edit mode
  const canvasWidth = fabricCanvasRef.current?.width || pdfDimensions?.width || 918;
  const canvasHeight = fabricCanvasRef.current?.height || pdfDimensions?.height || 1188;

  return (
    <div className="relative flex items-center justify-center bg-gray-50 p-4 rounded-lg shadow-inner">
      <div ref={containerRef} className="relative inline-block" style={{ position: 'relative' }}>
        {/* Single canvas element - always rendered, never unmounted */}
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          style={{ 
            // In edit mode, don't set position/top/left - let loadPDFContent set it
            position: editMode && pdfFile ? undefined : (pdfFile && pdfDimensions ? 'absolute' : 'absolute'),
            top: editMode && pdfFile ? undefined : (pdfFile && pdfDimensions ? 0 : 'auto'),
            left: editMode && pdfFile ? undefined : (pdfFile && pdfDimensions ? 0 : 'auto'),
            margin: editMode && pdfFile ? undefined : 0,
            zIndex: editMode && pdfFile ? 1 : pdfFile ? 1000 : 10,
            pointerEvents: 'auto',
            cursor: tool === 'text' ? 'text' : tool === 'draw' || tool === 'highlight' ? 'crosshair' : tool === 'erase' ? 'not-allowed' : 'default',
            display: pdfFile || pdfDimensions ? 'block' : 'none',
            border: editMode && pdfFile ? '1px solid #ccc' : pdfFile ? '2px solid red' : 'none',
            backgroundColor: editMode && pdfFile ? 'white' : 'transparent',
            width: editMode && pdfFile ? canvasWidth : pdfDimensions?.width ? '100%' : canvasWidth,
            height: editMode && pdfFile ? canvasHeight : pdfDimensions?.height ? '100%' : canvasHeight,
            padding: 0,
          }}
        />

        {/* Blank PDF view */}
        {!pdfFile && pdfDimensions && (
          <div className="relative bg-white border border-gray-300" style={{ width: pdfDimensions.width, height: pdfDimensions.height }}>
            {/* Canvas is positioned absolutely above */}
          </div>
        )}

        {/* PDF view - always rendered to prevent layout shifts, hidden in edit mode */}
        {pdfFile && (
          <div 
            ref={pdfWrapperRef} 
            className="relative" 
            data-canvas-container
            style={{
              display: editMode ? 'none' : 'block',
            }}
          >
            <PdfViewer
              file={pdfFile}
              pageNumber={currentPage}
              scale={1.5}
              onPageLoad={handlePageLoad}
              className="z-0"
            />
            {/* Canvas overlay container - positioned to match PDF exactly */}
            {pdfDimensions && (
              <div
                className="absolute"
                data-canvas-container
                style={{
                  top: 0,
                  left: 0,
                  width: pdfDimensions.width,
                  height: pdfDimensions.height,
                  pointerEvents: 'none',
                  zIndex: 1000,
                }}
              >
                {/* Canvas is positioned absolutely above, matching this container */}
              </div>
            )}
          </div>
        )}

        {/* No PDF loaded */}
        {!pdfFile && !pdfDimensions && (
          <div className="flex items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-lg" style={{ minWidth: '612px', minHeight: '792px' }}>
            <p className="text-gray-500">No PDF loaded</p>
          </div>
        )}
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
