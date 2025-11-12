'use client';

import { useEffect, useRef, useState, useMemo, memo, useCallback } from 'react';
import PdfViewer from './PdfViewer';

interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  originalText: string;
}

// Separate component for each editable text element using input/textarea
const EditableTextElement = memo(function EditableTextElement({
  element,
  onTextChange,
}: {
  element: TextElement;
  onTextChange: (id: string, text: string) => void;
}) {
  // Use ref to store the onTextChange callback to avoid re-renders
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);
  const [isFocused, setIsFocused] = useState(false);
  const [value, setValue] = useState(() => element.text); // Initialize once
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const lastElementIdRef = useRef(element.id);
  const isInitialMount = useRef(true);
  
  // Only update value from element prop on initial mount or if element ID changed
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return; // Don't update on first render
    }
    
    if (lastElementIdRef.current !== element.id) {
      // Completely new element
      lastElementIdRef.current = element.id;
      setValue(element.text);
    }
    // Don't update if element.text changes - let user's edits persist
  }, [element.id]); // Only depend on element.id, not element.text
  
  // Use textarea for paragraphs (which are typically multiline or have multiple words)
  // Use initial element values to avoid recalculation on every render
  const isMultiline = useMemo(() => {
    const initialText = element.text || '';
    // Use textarea if:
    // 1. Text contains newlines
    // 2. Height is significantly larger than font size (likely multiline)
    // 3. Text contains multiple words (likely a paragraph)
    return initialText.includes('\n') || 
           element.height > element.fontSize * 1.5 || 
           initialText.split(' ').length > 3;
  }, [element.height, element.fontSize]); // Don't depend on element.text
  const Component = isMultiline ? 'textarea' : 'input';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    // Don't call onTextChange on every keystroke to avoid re-renders
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Update parent with final value only on blur
    onTextChangeRef.current(element.id, value);
  };

  return (
    <Component
      ref={inputRef as any}
      type={isMultiline ? undefined : 'text'}
      value={value}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={{
        position: 'absolute',
        left: `${element.x}px`,
        top: `${element.y}px`,
        width: `${Math.max(element.width, 100)}px`,
        height: isMultiline ? `${Math.max(element.height, element.fontSize * 1.5)}px` : `${element.height}px`,
        fontSize: `${element.fontSize}px`,
        fontFamily: element.fontFamily,
        color: '#000000',
        backgroundColor: 'transparent',
        border: 'none',
        boxShadow: 'none',
        zIndex: isFocused ? 100 : 10,
        outline: 'none',
        padding: 0,
        margin: 0,
        pointerEvents: 'auto',
        cursor: 'text',
        resize: 'none',
        overflow: isMultiline ? 'auto' : 'hidden',
        whiteSpace: isMultiline ? 'pre-wrap' : 'nowrap',
        lineHeight: '1.2',
        boxSizing: 'border-box',
        textShadow: isFocused ? 'none' : '0 0 0 transparent',
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          inputRef.current?.blur();
        }
      }}
    />
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if element ID or position changes
  // Don't re-render if only text changes (user is editing)
  return (
    prevProps.element.id === nextProps.element.id &&
    prevProps.element.x === nextProps.element.x &&
    prevProps.element.y === nextProps.element.y &&
    prevProps.element.width === nextProps.element.width &&
    prevProps.element.height === nextProps.element.height &&
    prevProps.element.fontSize === nextProps.element.fontSize &&
    prevProps.element.fontFamily === nextProps.element.fontFamily
  );
});

interface PdfTextEditorProps {
  pdfFile: File | ArrayBuffer | null;
  currentPage: number;
  onTextChange?: (texts: Array<{ text: string; x: number; y: number; fontSize: number; fontFamily: string }>) => void;
}

export default function PdfTextEditor({
  pdfFile,
  currentPage,
  onTextChange,
}: PdfTextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [pdfPageRect, setPdfPageRect] = useState<DOMRect | null>(null);
  const [isExtracting, setIsExtracting] = useState(true);

  // Store onTextChange in ref to avoid re-extraction
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

  // Extract text positions from PDF text layer
  useEffect(() => {
    if (!pdfFile) {
      setTextElements([]);
      setPdfPageRect(null);
      setIsExtracting(false);
      return;
    }

    let isCancelled = false;
    setIsExtracting(true);

    const extractTextPositions = async () => {
      // Retry multiple times to find the text layer
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts && !isCancelled) {
        // Wait for PDF to render
        await new Promise(resolve => setTimeout(resolve, 300 + (attempts * 200)));

        if (isCancelled) return;

        const textLayer = document.querySelector('.react-pdf__Page__textContent');
        const pdfPage = document.querySelector('.react-pdf__Page');

        if (textLayer && pdfPage) {
          const pageRect = pdfPage.getBoundingClientRect();
          
          // Check if page has valid dimensions
          if (pageRect.width > 0 && pageRect.height > 0) {
            if (isCancelled) return;
            
            setPdfPageRect(pageRect);

            const spans = textLayer.querySelectorAll('span');
            const spanData: Array<{
              text: string;
              x: number;
              y: number;
              width: number;
              height: number;
              fontSize: number;
              fontFamily: string;
              right: number;
            }> = [];

            // First, collect all span data
            spans.forEach((span) => {
              const rect = span.getBoundingClientRect();
              const text = span.textContent || '';

              if (text.trim()) {
                // Calculate position relative to PDF page
                const x = rect.left - pageRect.left;
                const y = rect.top - pageRect.top;
                const computedStyle = window.getComputedStyle(span);
                const fontSize = parseFloat(computedStyle.fontSize) || 12;
                const fontFamily = computedStyle.fontFamily.split(',')[0].replace(/['"]/g, '').trim() || 'Arial';

                spanData.push({
                  text: text.trim(),
                  x,
                  y,
                  width: rect.width,
                  height: rect.height,
                  fontSize,
                  fontFamily,
                  right: x + rect.width,
                });
              }
            });

            // Group spans into paragraphs based on Y position and proximity
            const elements: TextElement[] = [];
            const used = new Set<number>();
            
            for (let i = 0; i < spanData.length; i++) {
              if (used.has(i)) continue;
              
              const current = spanData[i];
              const paragraphSpans = [current];
              used.add(i);
              
              // Find all spans on the same line or nearby lines (within 5px vertically)
              for (let j = i + 1; j < spanData.length; j++) {
                if (used.has(j)) continue;
                
                const other = spanData[j];
                const yDiff = Math.abs(current.y - other.y);
                const fontSizeDiff = Math.abs(current.fontSize - other.fontSize);
                
                // Group if:
                // 1. Same line (yDiff < 5px) OR
                // 2. Next line with similar font size (yDiff < fontSize * 1.5 and fontSizeDiff < 2)
                if (yDiff < 5 || (yDiff < current.fontSize * 1.5 && fontSizeDiff < 2)) {
                  paragraphSpans.push(other);
                  used.add(j);
                }
              }
              
              // Sort spans by reading order: top to bottom, left to right
              paragraphSpans.sort((a, b) => {
                const yDiff = Math.abs(a.y - b.y);
                if (yDiff < 5) {
                  // Same line, sort by X (left to right)
                  return a.x - b.x;
                }
                // Different lines, sort by Y (top to bottom)
                return a.y - b.y;
              });
              
              // Combine into single paragraph
              // Add space between spans that are on different lines
              const combinedText = paragraphSpans.map((s, idx) => {
                if (idx === 0) return s.text;
                const prev = paragraphSpans[idx - 1];
                const yDiff = Math.abs(s.y - prev.y);
                // If on different line, add newline, otherwise add space
                return yDiff > 5 ? '\n' + s.text : ' ' + s.text;
              }).join('');
              
              // Calculate paragraph bounds - use exact positions from first span
              const firstSpan = paragraphSpans[0];
              const lastSpan = paragraphSpans[paragraphSpans.length - 1];
              
              // Use first span's exact position for alignment
              const x = firstSpan.x;
              const y = firstSpan.y;
              
              // Calculate width and height from all spans
              const minX = Math.min(...paragraphSpans.map(s => s.x));
              const maxX = Math.max(...paragraphSpans.map(s => s.right));
              const minY = Math.min(...paragraphSpans.map(s => s.y));
              const maxY = Math.max(...paragraphSpans.map(s => s.y + s.height));
              
              const width = maxX - minX;
              const height = maxY - minY;
              
              const avgFontSize = firstSpan.fontSize;
              const avgFontFamily = firstSpan.fontFamily;
              
              // Use first span's exact position, but adjust width to cover all spans
              elements.push({
                id: `text-${currentPage}-${i}`,
                text: combinedText,
                originalText: combinedText,
                x: x, // Use first span's exact X position
                y: y, // Use first span's exact Y position
                width: width,
                height: height,
                fontSize: avgFontSize,
                fontFamily: avgFontFamily,
              });
              
              if (i < 3) {
                console.log(`Paragraph ${i}:`, {
                  text: combinedText.substring(0, 30),
                  firstSpan: { x: firstSpan.x.toFixed(1), y: firstSpan.y.toFixed(1) },
                  position: { x: x.toFixed(1), y: y.toFixed(1) },
                  bounds: { minX: minX.toFixed(1), maxX: maxX.toFixed(1), minY: minY.toFixed(1), maxY: maxY.toFixed(1) },
                  size: { width: width.toFixed(1), height: height.toFixed(1) }
                });
              }
            }

            if (!isCancelled) {
              console.log(`Extracted ${elements.length} text elements for page ${currentPage}`);
              if (elements.length > 0) {
                console.log('Sample text element positions:', {
                  first: { text: elements[0].text.substring(0, 20), x: elements[0].x, y: elements[0].y },
                  pageRect: { width: pageRect.width, height: pageRect.height }
                });
              }
              setTextElements(elements);
              setIsExtracting(false);
              
              if (onTextChangeRef.current) {
                onTextChangeRef.current(elements.map(el => ({
                  text: el.text,
                  x: el.x,
                  y: el.y,
                  fontSize: el.fontSize,
                  fontFamily: el.fontFamily,
                })));
              }
            }
            
            return; // Success, exit retry loop
          }
        }
        
        attempts++;
        if (attempts < 3) {
          console.log(`Attempt ${attempts}/${maxAttempts} to find text layer...`);
        }
      }
      
      if (!isCancelled) {
        // If we get here, we couldn't find the text layer
        console.warn('Text layer or PDF page not found after multiple attempts');
        setIsExtracting(false);
        
        // Still try to set pdfPageRect from PDF page if it exists
        const pdfPage = document.querySelector('.react-pdf__Page');
        if (pdfPage) {
          const pageRect = pdfPage.getBoundingClientRect();
          if (pageRect.width > 0 && pageRect.height > 0) {
            setPdfPageRect(pageRect);
          }
        }
      }
    };

    extractTextPositions();

    // Re-extract on window resize (debounced)
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (!isCancelled) {
          setIsExtracting(true);
          extractTextPositions();
        }
      }, 500);
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      isCancelled = true;
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [pdfFile, currentPage]); // Removed onTextChange from dependencies

  const handleTextChange = useCallback((id: string, newText: string) => {
    // Update local state
    setTextElements(prev => {
      const updated = prev.map(el => 
        el.id === id ? { ...el, text: newText } : el
      );
      
      // Call parent callback with updated elements (only called on blur)
      if (onTextChange) {
        onTextChange(updated.map(el => ({
          text: el.text,
          x: el.x,
          y: el.y,
          fontSize: el.fontSize,
          fontFamily: el.fontFamily,
        })));
      }
      
      return updated;
    });
  }, [onTextChange]);

  if (!pdfFile) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">No PDF loaded</p>
      </div>
    );
  }

  // Calculate overlay position relative to container
  const [overlayPosition, setOverlayPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!pdfPageRect || !containerRef.current) {
      setOverlayPosition(null);
      return;
    }

    const updatePosition = () => {
      const pdfPage = document.querySelector('.react-pdf__Page');
      if (!pdfPage || !containerRef.current) return;

      const currentPageRect = pdfPage.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      
      const left = currentPageRect.left - containerRect.left;
      const top = currentPageRect.top - containerRect.top;
      
      // Only update if position actually changed (avoid unnecessary re-renders)
      setOverlayPosition(prev => {
        if (prev && Math.abs(prev.left - left) < 1 && Math.abs(prev.top - top) < 1) {
          return prev; // No significant change
        }
        if (!prev || Math.abs(prev.left - left) > 0.5 || Math.abs(prev.top - top) > 0.5) {
          console.log('Overlay position updated:', {
            pdfPage: { left: currentPageRect.left.toFixed(1), top: currentPageRect.top.toFixed(1), width: currentPageRect.width.toFixed(1), height: currentPageRect.height.toFixed(1) },
            container: { left: containerRect.left.toFixed(1), top: containerRect.top.toFixed(1) },
            overlay: { left: left.toFixed(1), top: top.toFixed(1) },
            prev: prev ? { left: prev.left.toFixed(1), top: prev.top.toFixed(1) } : null
          });
        }
        return { left, top };
      });
    };

    updatePosition();

    // Update on scroll and resize
    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    
    // Update less frequently to avoid blinking (only when needed)
    // Only update on actual scroll/resize, not periodically
    // const interval = setInterval(updatePosition, 1000);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      // clearInterval(interval);
    };
  }, [pdfPageRect]);

  // Hide PDF text layer when in edit mode (but keep it for position extraction)
  // We hide it after extraction is complete
  useEffect(() => {
    if (!isExtracting && textElements.length > 0) {
      const hideTextLayer = () => {
        const textLayer = document.querySelector('.react-pdf__Page__textContent');
        if (textLayer) {
          (textLayer as HTMLElement).style.opacity = '0';
          (textLayer as HTMLElement).style.pointerEvents = 'none';
        }
      };
      
      hideTextLayer();
      const interval = setInterval(hideTextLayer, 200);
      
      return () => clearInterval(interval);
    }
  }, [isExtracting, textElements.length]);

  return (
    <div ref={containerRef} className="relative" style={{ position: 'relative' }}>
      {/* PDF Viewer - always visible */}
      <PdfViewer
        file={pdfFile}
        pageNumber={currentPage}
        scale={1.5}
        className="z-0"
      />

      {/* Loading indicator */}
      {isExtracting && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50 z-20">
          <p className="text-gray-600">Extracting text...</p>
        </div>
      )}

      {/* Editable text overlays */}
      {pdfPageRect && overlayPosition && textElements.length > 0 && (
        <div
          className="absolute z-10"
          style={{
            left: `${overlayPosition.left}px`,
            top: `${overlayPosition.top}px`,
            width: `${pdfPageRect.width}px`,
            height: `${pdfPageRect.height}px`,
            pointerEvents: 'auto',
          }}
        >
        {textElements.map((element) => (
          <EditableTextElement
            key={element.id}
            element={element}
            onTextChange={handleTextChange}
          />
        ))}
        </div>
      )}
      
      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-0 left-0 bg-black bg-opacity-75 text-white text-xs p-2 z-30">
          <div>Text Elements: {textElements.length}</div>
          <div>PDF Page Rect: {pdfPageRect ? `${pdfPageRect.width}x${pdfPageRect.height}` : 'null'}</div>
          <div>Overlay Position: {overlayPosition ? `${overlayPosition.left.toFixed(0)}, ${overlayPosition.top.toFixed(0)}` : 'null'}</div>
          <div>Is Extracting: {isExtracting ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  );
}

