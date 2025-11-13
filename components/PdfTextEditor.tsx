'use client';

import { useEffect, useRef, useState, useMemo, memo, useCallback } from 'react';
import PdfViewer from './PdfViewer';
import * as pdfjsLib from 'pdfjs-dist';

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
  lineHeight?: number;
  transform?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontVariant?: string;
  letterSpacing?: string;
  wordSpacing?: string;
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
      className="pdf-editable-text"
      // Make it feel like clicking directly on the PDF text
      onClick={(e) => {
        e.stopPropagation();
        // Select all text when clicking to make editing easier
        if (inputRef.current) {
          inputRef.current.select();
        }
      }}
      style={{
        position: 'absolute',
        // Position exactly where the original text is - pixel perfect alignment
        // Use sub-pixel precision for better alignment
        // Position from PDF coordinates (already calculated from viewport)
        left: `${element.x}px`,
        top: `${element.y}px`,
        // Ensure no rounding issues by using exact pixel values
        // Use exact dimensions from DOM - don't modify them!
        width: `${element.width}px`, // Use exact width from DOM
        height: `${element.height}px`, // Use exact height from DOM - this matches the span height perfectly
        fontSize: `${element.fontSize}px`,
        fontFamily: element.fontFamily,
        // Make text look exactly like the original PDF text
        color: value.trim() ? '#000000' : 'transparent',
        // Match all font properties from the original span exactly
        fontWeight: element.fontWeight || 'normal',
        fontStyle: element.fontStyle || 'normal',
        fontVariant: element.fontVariant || 'normal',
        letterSpacing: element.letterSpacing || 'normal',
        wordSpacing: element.wordSpacing || 'normal',
        // Completely transparent background - make it feel like editing the PDF directly
        backgroundColor: 'transparent',
        border: 'none',
        boxShadow: 'none',
        // Only show visual feedback when focused
        zIndex: isFocused ? 100 : 10,
        // Debug mode: show blue outline to compare with original spans
        // Check if debug mode is enabled via element property or environment
        ...(process.env.NODE_ENV === 'development' && ((element as any).__debugMode || (window as any).__pdfEditorDebugMode) ? {
          outline: '2px solid blue',
          outlineOffset: '-1px',
        } : {
          outline: 'none',
          caretColor: '#000000', // Black caret to match text
        }),
        padding: '0',
        margin: 0,
        pointerEvents: 'auto',
        cursor: 'text',
        resize: 'none',
        overflow: 'hidden',
        overflowX: 'hidden',
        overflowY: 'hidden',
        whiteSpace: isMultiline ? 'pre-wrap' : 'nowrap',
        // Hide scrollbars completely
        scrollbarWidth: 'none', // Firefox
        msOverflowStyle: 'none', // IE and Edge
        // Match line-height exactly to ensure text aligns properly
        // Use the actual line-height from DOM if available, otherwise calculate from height
        // The height from DOM is the actual rendered height, so use it directly
        lineHeight: element.lineHeight && element.fontSize
          ? `${element.lineHeight / element.fontSize}`
          : element.height && element.fontSize
          ? `${element.height / element.fontSize}` // Use actual height/fontSize ratio from DOM
          : '1.0', // Fallback
        // Adjust vertical alignment - input elements position text from top
        // but spans position text at baseline. We need to adjust for this.
        // The adjustment depends on font metrics - typically ~20% of font size
        // is below the baseline, so we adjust the top position slightly
        // Use small padding-top to fine-tune baseline alignment
        // This helps align the text baseline with the original PDF text
        paddingTop: '0',
        paddingBottom: '0',
        // Remove vertical-align as it doesn't work on input/textarea elements
        // Instead, we adjust the Y position directly in the element calculation
        // Ensure text starts at the very top of the element
        marginTop: '0',
        marginBottom: '0',
        boxSizing: 'border-box',
        textShadow: 'none',
        // Don't apply the span's transform - getBoundingClientRect already accounts for it
        // Use translateZ(0) for hardware acceleration only
        transform: 'translateZ(0)',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        // Ensure vertical alignment matches the original text
        // Input/textarea elements need to align text at the top, not center
        verticalAlign: 'top',
        // Remove any default browser styling that could affect alignment
        textAlign: 'left',
        textIndent: '0',
        // Ensure text aligns at the top of the element, not vertically centered
        display: 'block',
        // Remove any default padding that might affect text position
        // Some browsers add default padding to input/textarea
        WebkitAppearance: 'none',
        MozAppearance: 'textfield',
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
  onTextChange?: (texts: Array<{ 
    text: string; 
    x: number; 
    y: number; 
    width: number;
    height: number;
    fontSize: number; 
    fontFamily: string;
    fontWeight?: string;
    fontStyle?: string;
    originalText?: string;
  }>) => void;
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
  const [debugMode, setDebugMode] = useState(true); // Enable debug mode by default
  
  // Track if text has changed to notify parent (only after blur, not on every keystroke)
  const textChangedRef = useRef(false);

  // Store onTextChange in ref to avoid re-extraction
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

  // Extract text positions directly from PDF using pdfjs
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
      try {
        // Set up pdfjs worker if needed
        if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }

        // Convert file to ArrayBuffer
        let arrayBuffer: ArrayBuffer;
        if (pdfFile instanceof File) {
          arrayBuffer = await pdfFile.arrayBuffer();
        } else {
          arrayBuffer = pdfFile;
        }

        // Load PDF document
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(currentPage);
        
        // Get viewport with same scale as PdfViewer (1.5)
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        // Wait for PDF page container to render in DOM to get its position
        let attempts = 0;
        const maxAttempts = 10;
        let pdfPageRect: DOMRect | null = null;
        
        while (attempts < maxAttempts && !isCancelled) {
          await new Promise(resolve => setTimeout(resolve, attempts === 0 ? 500 : 200));
          
          const pdfPage = document.querySelector('.react-pdf__Page');
          if (pdfPage) {
            const rect = pdfPage.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              pdfPageRect = rect;
              break;
            }
          }
          attempts++;
        }

        if (isCancelled || !pdfPageRect) {
          setIsExtracting(false);
          return;
        }

        setPdfPageRect(pdfPageRect);

        // Wait for DOM to be ready, including canvas container
        // Retry up to 5 times with increasing delays to find canvas container
        let coordinateReference: Element | null = null;
        let pdfPageElementRect: DOMRect | null = null;
        
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 300 + attempt * 200));
          
          // Try to get actual DOM positions from text layer if available
          const textLayer = document.querySelector('.react-pdf__Page__textContent');
          // Get PDF page element for coordinate conversion (use different name to avoid conflict)
          // Also check for canvas container - it's the actual PDF content area
          const canvasContainer = document.querySelector('.canvas-container');
          const pdfPageElement = document.querySelector('.react-pdf__Page');
          // Prefer canvas container if it exists, otherwise use PDF page
          coordinateReference = canvasContainer || pdfPageElement;
          pdfPageElementRect = coordinateReference ? coordinateReference.getBoundingClientRect() : null;
          
          if (pdfPageElementRect && pdfPageElementRect.width > 0 && pdfPageElementRect.height > 0) {
            if (debugMode) {
              console.log(`Found coordinate reference on attempt ${attempt + 1}:`, 
                canvasContainer ? 'canvas-container' : 'react-pdf__Page',
                pdfPageElementRect);
            }
            break;
          }
        }

        // Extract text content directly from PDF with all details
        const textContent = await page.getTextContent();
        
        // Get text layer for span matching
        const textLayer = document.querySelector('.react-pdf__Page__textContent');
        const textLayerRect = textLayer ? textLayer.getBoundingClientRect() : null;
        
        interface TextItemData {
          text: string;
          x: number;
          y: number;
          width: number;
          height: number;
          fontSize: number;
          fontFamily: string;
          fontWeight: string;
          fontStyle: string;
          fontVariant: string;
          letterSpacing: string;
          wordSpacing: string;
          right: number;
          lineHeight: number;
        }

        const textItems: TextItemData[] = [];

        // Create canvas for accurate text width measurement
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Process each text item from PDF
        for (const item of textContent.items) {
          if (!('str' in item) || !item.str || !item.str.trim()) continue;

          const transform = item.transform || [12, 0, 0, 12, 0, 0];
          // Transform matrix: [a, b, c, d, e, f]
          // a, d = scale (font size), e, f = translation (position)
          // Prefer actual font size from DOM if available (most accurate)
          // ALWAYS prefer actual DOM font size - it's the rendered size
          let fontSize = (item as any).__actualFontSize;
          if (!fontSize || isNaN(fontSize)) {
            // Fallback to PDF transform, but scale it by viewport scale
            const pdfFontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || 12;
            fontSize = pdfFontSize * scale; // Scale to viewport
          }
          // Ensure we're using the actual rendered font size, not scaled down
          const fontHeight = fontSize; // Use fontSize for height, not transform
          
          // PDF coordinates: transform[4] = x, transform[5] = y (from bottom-left origin)
          // Convert to viewport coordinates (top-left origin)
          // PDF Y is the baseline position from the bottom of the page
          const pdfX = transform[4] || 0;
          const pdfY = transform[5] || 0;
          
          // Try to get actual DOM position from text layer if available (most accurate)
          let viewportX: number;
          let viewportY: number;
          
          if (textLayer && textLayerRect) {
            // Find the corresponding span in DOM
            const spans = textLayer.querySelectorAll('span');
            let matchingSpan: HTMLSpanElement | null = null;
            
            for (const span of spans) {
              const spanText = (span.textContent || '').trim();
              if (spanText === item.str.trim()) {
                matchingSpan = span;
                break;
              }
            }
            
            if (matchingSpan && pdfPageElementRect) {
              const spanRect = matchingSpan.getBoundingClientRect();
              // Convert to coordinates relative to coordinate reference (canvas container or PDF page)
              // Element positions are relative to the overlay container
              // The overlay container is positioned at: referenceRect.left - containerRect.left
              // So element.x should be: spanRect.left - referenceRect.left (relative to overlay)
              // This ensures that when overlay is at (A, B) and element is at (C, D),
              // the final position is (A+C, B+D) = referenceRect.left + (spanRect.left - referenceRect.left) = spanRect.left ✓
              viewportX = spanRect.left - pdfPageElementRect.left;
              viewportY = spanRect.top - pdfPageElementRect.top;
              
              if (debugMode && textItems.length < 3) {
                const refType = coordinateReference?.classList?.contains('canvas-container') ? 'canvas-container' : 'react-pdf__Page';
                console.log(`Text item ${textItems.length}:`, {
                  text: item.str.substring(0, 30),
                  spanViewport: { left: spanRect.left.toFixed(2), top: spanRect.top.toFixed(2), width: spanRect.width.toFixed(2), height: spanRect.height.toFixed(2) },
                  referenceViewport: { left: pdfPageElementRect.left.toFixed(2), top: pdfPageElementRect.top.toFixed(2) },
                  elementRelative: { x: viewportX.toFixed(2), y: viewportY.toFixed(2) },
                  referenceType: refType,
                  note: 'Element position is relative to overlay, which aligns with reference element'
                });
              }
              // Use actual span dimensions from DOM - this is the most accurate!
              // Store these for later use
              (item as any).__actualSpanWidth = spanRect.width;
              (item as any).__actualSpanHeight = spanRect.height;
              
              // Get actual font size and properties from computed style (most accurate)
              const spanStyle = window.getComputedStyle(matchingSpan);
              const actualFontSize = parseFloat(spanStyle.fontSize);
              if (actualFontSize && !isNaN(actualFontSize)) {
                (item as any).__actualFontSize = actualFontSize;
              }
              
              // Get actual line-height from DOM
              const actualLineHeight = parseFloat(spanStyle.lineHeight);
              if (actualLineHeight && !isNaN(actualLineHeight)) {
                (item as any).__actualLineHeight = actualLineHeight;
              }
              
              // Store the span reference for later font property extraction
              (item as any).__matchingSpan = matchingSpan;
            } else {
              // Fallback to PDF coordinate calculation
              viewportX = pdfX;
              const spanTop = viewport.height - pdfY - fontSize;
              viewportY = spanTop;
            }
          } else {
            // No text layer available, use PDF coordinate calculation
            // react-pdf positions span top at: viewport.height - pdfY - fontSize
            viewportX = pdfX;
            const spanTop = viewport.height - pdfY - fontSize;
            viewportY = spanTop;
          }

          // Extract font name and properties
          // Prefer actual computed style from DOM if available (most accurate)
          let fontFamily = 'Arial';
          let fontWeight = 'normal';
          let fontStyle = 'normal';
          
          // Get font properties from matching span if available
          if ((item as any).__matchingSpan) {
            const spanStyle = window.getComputedStyle((item as any).__matchingSpan);
            fontFamily = spanStyle.fontFamily.split(',')[0].replace(/['"]/g, '').trim() || 'Arial';
            fontWeight = spanStyle.fontWeight || 'normal';
            fontStyle = spanStyle.fontStyle || 'normal';
          } else if ('fontName' in item && item.fontName) {
            const fontName = String(item.fontName);
            
            // Extract base font family (remove encoding suffixes)
            fontFamily = fontName
              .replace(/[A-Z]{2,}$/, '') // Remove encoding like "MT", "Bold"
              .replace(/MT$/, '')
              .replace(/Bold$/, '')
              .replace(/Italic$/, '')
              .replace(/Oblique$/, '')
              || 'Arial';
            
            // Determine font weight and style from font name
            if (fontName.includes('Bold') || fontName.includes('bold')) {
              fontWeight = 'bold';
            }
            if (fontName.includes('Italic') || fontName.includes('italic') || 
                fontName.includes('Oblique') || fontName.includes('oblique')) {
              fontStyle = 'italic';
            }
          }

          // Measure text width and height accurately
          // ALWAYS prefer actual DOM span dimensions - they're pixel-perfect!
          let textWidth: number;
          let textHeight: number;
          
          if ((item as any).__actualSpanWidth !== undefined) {
            textWidth = (item as any).__actualSpanWidth;
          } else {
            // Fallback to canvas measurement
            textWidth = fontSize * item.str.length * 0.6; // Fallback estimate
            if (ctx) {
              ctx.font = `${fontWeight} ${fontStyle} ${fontSize}px ${fontFamily}`;
              const metrics = ctx.measureText(item.str);
              textWidth = metrics.width;
            }
          }
          
          // Use actual span height from DOM if available (most accurate)
          if ((item as any).__actualSpanHeight !== undefined) {
            textHeight = (item as any).__actualSpanHeight;
          } else {
            // Fallback to fontHeight (which is fontSize)
            textHeight = fontHeight;
          }

          // Get line-height from DOM if available
          const lineHeight = (item as any).__actualLineHeight || fontSize * 1.2;
          
          textItems.push({
            text: item.str,
            x: viewportX,
            y: viewportY,
            width: textWidth,
            height: textHeight,
            fontSize,
            fontFamily,
            fontWeight,
            fontStyle,
            fontVariant: 'normal', // PDF doesn't provide this
            letterSpacing: 'normal', // PDF doesn't provide this
            wordSpacing: 'normal', // PDF doesn't provide this
            right: viewportX + textWidth,
            lineHeight, // Store line-height for use in element
          });
        }

        // Group text items into paragraphs
        // Very conservative: only group items that are clearly on the same line and close together
        const elements: TextElement[] = [];
        const used = new Set<number>();

        for (let i = 0; i < textItems.length; i++) {
          if (used.has(i)) continue;

          const current = textItems[i];
          const paragraphItems = [current];
          used.add(i);

          // Find nearby text items that belong to the same paragraph
          // Be very conservative - only group if clearly on same line and close
          // Use a while loop to chain consecutive items together
          let searchIndex = i;
          let foundMore = true;
          
          while (foundMore) {
            foundMore = false;
            const lastItem = paragraphItems[paragraphItems.length - 1];
            
            for (let j = searchIndex + 1; j < textItems.length; j++) {
              if (used.has(j)) continue;

              const other = textItems[j];
              const yDiff = Math.abs(lastItem.y - other.y);
              const xDiff = other.x - lastItem.right;
              const fontSizeDiff = Math.abs(lastItem.fontSize - other.fontSize);
              
              // Grouping criteria:
              // 1. Must be on the same line (yDiff < fontSize * 0.2 - allow some tolerance)
              // 2. For same line: allow larger gaps (up to 5 * fontSize) to handle titles with spacing
              // 3. Must have similar font size (diff < 2px to handle rounding)
              const isSameLine = yDiff < lastItem.fontSize * 0.2; // Allow some Y tolerance for same line
              // For same line items, allow larger gaps (titles often have spacing)
              const isCloseHorizontally = xDiff >= 0 && (isSameLine ? xDiff < lastItem.fontSize * 5 : xDiff < lastItem.fontSize * 1.5);
              const isSimilarFont = fontSizeDiff < 2; // Allow 2px difference for rounding
              
              // Only group if all conditions are met
              if (isSameLine && isCloseHorizontally && isSimilarFont) {
                paragraphItems.push(other);
                used.add(j);
                foundMore = true;
                searchIndex = j; // Continue from this position
                break; // Restart search from this new item
              } else if (isSameLine && xDiff < 0) {
                // If overlapping or before, might be same word split - check if very close
                const overlap = Math.abs(xDiff);
                if (overlap < lastItem.fontSize * 0.5 && isSimilarFont) {
                  paragraphItems.push(other);
                  used.add(j);
                  foundMore = true;
                  searchIndex = j;
                  break;
                }
              }
            }
          }

          // Sort by reading order
          const avgFontSize = paragraphItems[0].fontSize;
          paragraphItems.sort((a, b) => {
            const yDiff = Math.abs(a.y - b.y);
            if (yDiff < avgFontSize * 0.5) {
              return a.x - b.x; // Same line, left to right
            }
            return a.y - b.y; // Top to bottom
          });

          // Combine text
          const combinedText = paragraphItems.map((item, idx) => {
            if (idx === 0) return item.text;
            const prev = paragraphItems[idx - 1];
            const yDiff = Math.abs(item.y - prev.y);
            return yDiff > avgFontSize * 0.5 ? '\n' + item.text : ' ' + item.text;
          }).join('');

          // Calculate bounds - use actual DOM measurements when available
          let minX = Math.min(...paragraphItems.map(item => item.x));
          let maxX = Math.max(...paragraphItems.map(item => item.right));
          // Use the first item's Y position as initial value
          // This will be overridden with actual DOM position if matching spans are found
          const firstItemY = paragraphItems[0].y;
          let minY = firstItemY; // Use let so we can override with DOM position
          let maxY = Math.max(...paragraphItems.map(item => item.y + item.height)); // Use let so we can override with DOM position
          
          // CRITICAL: Also try to get the actual Y position from the first item's matching span
          // This ensures we use the correct position even if grouping matching fails
          let firstItemActualY = firstItemY;
          if (textLayer && pdfPageElementRect) {
            const spans = textLayer.querySelectorAll('span');
            for (const span of spans) {
              const spanText = (span.textContent || '').trim();
              if (spanText === paragraphItems[0].text.trim()) {
                const spanRect = span.getBoundingClientRect();
                firstItemActualY = spanRect.top - pdfPageElementRect.top;
                if (debugMode && elements.length < 3) {
                  console.log(`Found first item span:`, {
                    text: paragraphItems[0].text.substring(0, 30),
                    firstItemY: firstItemY.toFixed(2),
                    firstItemActualY: firstItemActualY.toFixed(2),
                    difference: Math.abs(firstItemY - firstItemActualY).toFixed(2)
                  });
                }
                break;
              }
            }
          }

          // Try to get actual width from DOM if text layer is available
          let actualWidth = maxX - minX;
          // CRITICAL: Use the SAME coordinate reference that was used during initial extraction
          // Don't re-fetch it - use the one from the closure scope to ensure consistency
          // The pdfPageElementRect and coordinateReference are already set correctly during extraction
          // Re-fetching might get a different element or different timing, causing misalignment
          const currentPdfPageElementRect = pdfPageElementRect;
          
          if (textLayer && currentPdfPageElementRect) {
            // Find all spans that match the paragraph items - match more accurately
            const spans = textLayer.querySelectorAll('span');
            const matchingSpans: HTMLSpanElement[] = [];
            
            // Create a map of item text to items for faster lookup
            const itemTextMap = new Map<string, typeof paragraphItems[0]>();
            paragraphItems.forEach(item => {
              const key = item.text.trim().toLowerCase();
              if (!itemTextMap.has(key)) {
                itemTextMap.set(key, item);
              }
            });
            
            for (const span of spans) {
              const spanText = (span.textContent || '').trim();
              const spanTextLower = spanText.toLowerCase();
              
              // Check for exact match or if span text is part of any item
              let matched = false;
              for (const [itemText, item] of itemTextMap.entries()) {
                if (spanTextLower === itemText || 
                    spanTextLower.includes(itemText) || 
                    itemText.includes(spanTextLower)) {
                  matchingSpans.push(span);
                  matched = true;
                  break;
                }
              }
              
              // Also check if span contains multiple items (for grouped spans)
              if (!matched) {
                let matchCount = 0;
                for (const item of paragraphItems) {
                  if (spanTextLower.includes(item.text.trim().toLowerCase())) {
                    matchCount++;
                  }
                }
                if (matchCount >= paragraphItems.length * 0.5) {
                  matchingSpans.push(span);
                }
              }
            }
            
            if (matchingSpans.length > 0 && currentPdfPageElementRect) {
              // Calculate the actual bounding box of all matching spans
              // Use the SAME coordinate reference as used during initial extraction
              const spanRects = Array.from(matchingSpans).map(span => span.getBoundingClientRect());
              const spanMinX = Math.min(...spanRects.map(rect => rect.left - currentPdfPageElementRect.left));
              const spanMaxX = Math.max(...spanRects.map(rect => rect.right - currentPdfPageElementRect.left));
              const spanMinY = Math.min(...spanRects.map(rect => rect.top - currentPdfPageElementRect.top));
              const spanMaxY = Math.max(...spanRects.map(rect => rect.bottom - currentPdfPageElementRect.top));
              
              if (debugMode && elements.length < 3) {
                console.log(`Found ${matchingSpans.length} matching spans for element ${elements.length}`);
                console.log(`Span bounds: minY=${spanMinY.toFixed(2)}, firstItemY=${firstItemY.toFixed(2)}, firstItemActualY=${firstItemActualY.toFixed(2)}`);
              }
              
              if (debugMode && elements.length < 3) {
                console.log(`Grouped paragraph ${elements.length}:`, {
                  text: combinedText.substring(0, 50),
                  matchingSpans: matchingSpans.length,
                  spanBounds: { minX: spanMinX.toFixed(2), maxX: spanMaxX.toFixed(2), minY: spanMinY.toFixed(2), maxY: spanMaxY.toFixed(2) },
                  calculatedBounds: { minX: minX.toFixed(2), maxX: maxX.toFixed(2), minY: minY.toFixed(2), maxY: maxY.toFixed(2) },
                  firstItemY: firstItemY.toFixed(2),
                  referenceType: coordinateReference?.classList?.contains('canvas-container') ? 'canvas-container' : 'react-pdf__Page',
                  referenceRect: pdfPageElementRect ? {
                    left: pdfPageElementRect.left.toFixed(2),
                    top: pdfPageElementRect.top.toFixed(2)
                  } : 'null'
                });
              }
              
              // Use DOM measurements for position and width (most accurate)
              // BUT: For Y position, use firstItemActualY (the first item's actual DOM position)
              // NOT spanMinY, because spanMinY might be from a different line when grouping multiple lines
              minX = spanMinX;
              actualWidth = spanMaxX - spanMinX;
              // Use the first item's actual Y position from DOM - this ensures we align with the first line
              // The render-time adjustment will fine-tune this further if needed
              minY = firstItemActualY !== firstItemY ? firstItemActualY : firstItemY;
              
              if (debugMode && elements.length < 3) {
                const yDifference = Math.abs(spanMinY - firstItemY);
                console.log(`Y position check for element ${elements.length}:`, {
                  spanMinY: spanMinY.toFixed(2),
                  firstItemY: firstItemY.toFixed(2),
                  firstItemActualY: firstItemActualY.toFixed(2),
                  difference: yDifference.toFixed(2),
                  usingY: minY.toFixed(2),
                  note: 'Using firstItemActualY to align with first line, not spanMinY which might be from different line'
                });
              }
              
              // Also update maxY to use actual DOM height for grouped elements
              if (matchingSpans.length > 1) {
                // For grouped spans, use the actual bounding box height
                const actualHeight = spanMaxY - spanMinY;
                // Update maxY to reflect actual DOM height
                const calculatedMaxY = minY + actualHeight;
                // Use the larger of calculated or actual DOM height
                maxY = Math.max(maxY, calculatedMaxY);
              } else {
                // For single span, use its actual height
                const actualHeight = spanMaxY - spanMinY;
                maxY = minY + actualHeight;
              }
            } else {
              // No matching spans found - use the first item's actual Y position from DOM
              // This is more reliable than firstItemY which might be from initial extraction timing
              if (firstItemActualY !== firstItemY) {
                minY = firstItemActualY;
                if (debugMode && elements.length < 3) {
                  console.log(`No matching spans found, using firstItemActualY:`, {
                    firstItemY: firstItemY.toFixed(2),
                    firstItemActualY: firstItemActualY.toFixed(2),
                    using: firstItemActualY.toFixed(2)
                  });
                }
              }
            }
          }

          const firstItem = paragraphItems[0];

          // Ensure width is at least the width of the widest single item
          const maxItemWidth = Math.max(...paragraphItems.map(item => item.width));
          const finalWidth = Math.max(actualWidth, maxItemWidth);

          const element: TextElement = {
            id: `text-${currentPage}-${elements.length}`,
            text: combinedText,
            originalText: combinedText,
            x: minX,
            y: minY,
            width: finalWidth,
            height: maxY - minY,
            fontSize: firstItem.fontSize,
            fontFamily: firstItem.fontFamily,
            lineHeight: (firstItem as any).lineHeight || firstItem.fontSize * 1.2, // Use actual line-height from DOM if available
            fontWeight: firstItem.fontWeight,
            fontStyle: firstItem.fontStyle,
            fontVariant: firstItem.fontVariant,
            letterSpacing: firstItem.letterSpacing,
            wordSpacing: firstItem.wordSpacing,
          };

          if (debugMode) {
            (element as any).__debugMode = true;
          }

          elements.push(element);
        }

        if (!isCancelled) {
          if (debugMode) {
            console.log('=== PDF TEXT EXTRACTION ===');
            console.log(`Total text items: ${textItems.length}`);
            console.log(`Grouped into ${elements.length} elements`);
            console.log('First 3 elements:', elements.slice(0, 3).map((el, idx) => ({
              index: idx,
              text: el.text.substring(0, 30),
              position: { x: el.x.toFixed(2), y: el.y.toFixed(2) },
              size: { width: el.width.toFixed(2), height: el.height.toFixed(2) },
              fontSize: el.fontSize.toFixed(2),
            })));
          }

          setTextElements(elements);
          setIsExtracting(false);
          textChangedRef.current = true;
        }
      } catch (error) {
        console.error('Error extracting text from PDF:', error);
        setIsExtracting(false);
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
      textChangedRef.current = true; // Mark that text has changed
      return updated;
    });
  }, []);

  // Notify parent of text changes after state update (deferred to avoid render issues)
  useEffect(() => {
    if (onTextChange && textElements.length > 0 && textChangedRef.current) {
      // Use setTimeout to defer the callback and avoid updating parent during render
      const timeoutId = setTimeout(() => {
        if (onTextChange) {
          onTextChange(textElements.map(el => ({
            text: el.text,
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            fontSize: el.fontSize,
            fontFamily: el.fontFamily,
            fontWeight: el.fontWeight,
            fontStyle: el.fontStyle,
            originalText: el.originalText,
          })));
        }
        textChangedRef.current = false;
      }, 0);
      
      return () => clearTimeout(timeoutId);
    }
  }, [textElements, onTextChange]);

  if (!pdfFile) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">No PDF loaded</p>
      </div>
    );
  }

  // Calculate overlay position relative to container
  const [overlayPosition, setOverlayPosition] = useState<{ left: number; top: number; width?: number; height?: number } | null>(null);

  useEffect(() => {
    if (!pdfPageRect || !containerRef.current) {
      setOverlayPosition(null);
      return;
    }

    const updatePosition = () => {
      // First try to find the canvas container (fabric.js canvas) - this is the actual PDF content area
      // Retry a few times to ensure canvas container is available
      let canvasContainer: Element | null = null;
      let pdfPage: Element | null = null;
      
      // Try to find canvas container or PDF page
      canvasContainer = document.querySelector('.canvas-container');
      pdfPage = document.querySelector('.react-pdf__Page');
      
      // Prefer canvas container if it exists (it's the actual PDF content)
      const referenceElement = canvasContainer || pdfPage;
      if (!referenceElement || !containerRef.current) return;

      const referenceRect = referenceElement.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      
      // Position overlay to match the reference element exactly
      // Text positions (element.x, element.y) are calculated as:
      //   spanRect.left - referenceRect.left
      //   spanRect.top - referenceRect.top
      // So they are relative to the reference element (canvas container or PDF page)
      // The overlay container should be positioned so that (0,0) in the overlay
      // corresponds to (0,0) in the coordinate reference
      // Therefore: overlay position = referenceRect position relative to container
      const left = referenceRect.left - containerRect.left;
      const top = referenceRect.top - containerRect.top;
      
      if (debugMode) {
        console.log('=== OVERLAY POSITION CALCULATION ===');
        console.log('Reference element:', canvasContainer ? 'canvas-container' : 'react-pdf__Page');
        console.log('Reference rect (viewport):', {
          left: referenceRect.left.toFixed(2),
          top: referenceRect.top.toFixed(2),
        });
        console.log('Container rect (viewport):', {
          left: containerRect.left.toFixed(2),
          top: containerRect.top.toFixed(2),
        });
        console.log('Overlay position (relative to container):', {
          left: left.toFixed(2),
          top: top.toFixed(2),
        });
        console.log('This means elements at (0,0) will be at:', {
          left: (containerRect.left + left).toFixed(2),
          top: (containerRect.top + top).toFixed(2),
        }, 'in viewport, which should match referenceRect');
        console.log('Verification - overlay should align with reference:', {
          expectedReferenceLeft: referenceRect.left.toFixed(2),
          calculatedLeft: (containerRect.left + left).toFixed(2),
          expectedReferenceTop: referenceRect.top.toFixed(2),
          calculatedTop: (containerRect.top + top).toFixed(2),
          leftMatch: Math.abs(referenceRect.left - (containerRect.left + left)) < 1,
          topMatch: Math.abs(referenceRect.top - (containerRect.top + top)) < 1
        });
      }
      
      if (debugMode) {
        console.log('=== OVERLAY POSITION ===');
        console.log('Reference element:', canvasContainer ? 'canvas-container' : 'react-pdf__Page');
        console.log('Reference rect:', {
          left: referenceRect.left.toFixed(2),
          top: referenceRect.top.toFixed(2),
          width: referenceRect.width.toFixed(2),
          height: referenceRect.height.toFixed(2),
        });
        console.log('Container rect:', {
          left: containerRect.left.toFixed(2),
          top: containerRect.top.toFixed(2),
          width: containerRect.width.toFixed(2),
          height: containerRect.height.toFixed(2),
        });
        console.log('Overlay position:', {
          left: left.toFixed(2),
          top: top.toFixed(2),
          width: referenceRect.width.toFixed(2),
          height: referenceRect.height.toFixed(2),
        });
      }
      
      // Only update if position actually changed (avoid unnecessary re-renders)
      setOverlayPosition(prev => {
        if (!prev || 
            prev.left !== left || 
            prev.top !== top ||
            prev.width !== referenceRect.width || 
            prev.height !== referenceRect.height) {
          return {
            left,
            top,
            width: referenceRect.width, 
            height: referenceRect.height 
          };
        }
        return prev;
      });
    };

    updatePosition();

    // Update on scroll and resize with debouncing
    let scrollTimeout: NodeJS.Timeout;
    let resizeTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updatePosition, 10);
    };
    
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updatePosition, 100);
    };

    // Use IntersectionObserver for better performance instead of continuous RAF
    const observer = new IntersectionObserver(
      () => {
        updatePosition();
      },
      { threshold: 0 }
    );

    const pdfPage = document.querySelector('.react-pdf__Page');
    if (pdfPage) {
      observer.observe(pdfPage);
    }

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      clearTimeout(scrollTimeout);
      clearTimeout(resizeTimeout);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [pdfPageRect, debugMode]);

  // Hide only the extracted text spans (those we've replaced with editable elements)
  // Keep the text layer structure but hide individual spans that we've extracted
  // IMPORTANT: Keep PDF canvas visible (images are on canvas, not text layer)
  useEffect(() => {
    if (!isExtracting && textElements.length > 0) {
      const hideExtractedText = () => {
        // Ensure PDF canvas (with images) is always visible
        const pdfCanvas = document.querySelector('.react-pdf__Page canvas');
        if (pdfCanvas) {
          const canvasEl = pdfCanvas as HTMLElement;
          canvasEl.style.opacity = '1';
          canvasEl.style.visibility = 'visible';
          canvasEl.style.display = 'block';
        }
        
        // Get all text spans from the PDF text layer
        const textSpans = document.querySelectorAll('.react-pdf__Page__textContent span');
        
        // Create a set of extracted text content for quick lookup
        // Include both original text and current text (in case user edited it)
        const extractedTexts = new Set<string>();
        textElements.forEach(el => {
          if (el.originalText) extractedTexts.add(el.originalText.toLowerCase().trim());
          if (el.text) extractedTexts.add(el.text.toLowerCase().trim());
        });
        
        textSpans.forEach((span) => {
          const spanEl = span as HTMLElement;
          const spanText = (span.textContent || '').toLowerCase().trim();
          
          // Check if this span's text matches any extracted text element
          // Hide if: text matches original OR if user has edited/deleted the text
          let shouldHide = false;
          for (const extractedText of extractedTexts) {
            // Check if the span text is part of extracted text or vice versa
            if (extractedText && spanText && (
                extractedText.includes(spanText) || 
                spanText.includes(extractedText) || 
                spanText === extractedText)) {
              shouldHide = true;
              break;
            }
          }
          
          // Also hide if the span text matches any element's text (even if edited or deleted)
          textElements.forEach(el => {
            const elText = (el.text || '').toLowerCase().trim();
            const elOriginalText = (el.originalText || '').toLowerCase().trim();
            
            if (spanText && elOriginalText) {
              // Check if span text matches the original text (even partially)
              const originalLower = elOriginalText.toLowerCase().trim();
              
              // If user deleted ALL the text, hide the original span
              if (!elText || elText.length === 0) {
                // Check if span contains any part of the original text
                // Use more lenient matching for deleted text - match if any significant portion matches
                if (spanText.includes(originalLower) || 
                    originalLower.includes(spanText) ||
                    (spanText.length > 5 && originalLower.length > 5 && 
                     (spanText.substring(0, Math.min(20, spanText.length)) === originalLower.substring(0, Math.min(20, originalLower.length))))) {
                  shouldHide = true;
                }
              }
              // If text exists (original or edited), hide matching spans
              else {
                // Hide if span matches original text
                if (spanText.includes(originalLower) || originalLower.includes(spanText)) {
                  shouldHide = true;
                }
                // Also hide if span matches current text
                const currentLower = elText.toLowerCase().trim();
                if (spanText.includes(currentLower) || currentLower.includes(spanText)) {
                  shouldHide = true;
                }
              }
            }
          });
          
          // Only hide spans that we've extracted and replaced (unless in debug mode)
          if (shouldHide && !debugMode) {
            spanEl.style.opacity = '0';
            spanEl.style.visibility = 'hidden';
            spanEl.style.pointerEvents = 'none';
            spanEl.style.display = 'none';
          } else if (shouldHide && debugMode) {
            // In debug mode, show original spans with red outline for comparison
            spanEl.style.opacity = '0.5';
            spanEl.style.visibility = 'visible';
            spanEl.style.pointerEvents = 'none';
            spanEl.style.display = '';
            spanEl.style.outline = '2px solid red';
            spanEl.style.outlineOffset = '-1px';
          } else {
            // Keep other text visible (text we didn't extract, like in images or complex layouts)
            spanEl.style.opacity = '1';
            spanEl.style.visibility = 'visible';
            spanEl.style.display = '';
          }
        });
      };
      
      // Hide immediately and also set up a watch
      hideExtractedText();
      const interval = setInterval(hideExtractedText, 200);
      
      return () => clearInterval(interval);
    }
  }, [isExtracting, textElements, debugMode]);

  return (
    <div ref={containerRef} className="relative" style={{ position: 'relative' }}>
      {/* PDF Viewer - always visible, enable text layer so we can hide original text */}
      <PdfViewer
        file={pdfFile}
        pageNumber={currentPage}
        scale={1.5}
        className="z-0"
        renderTextLayer={true}
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
            // Position overlay to align with coordinate reference
            // Elements inside use positions relative to this overlay
            left: `${overlayPosition.left}px`,
            top: `${overlayPosition.top}px`,
            // Use text layer dimensions if available, otherwise use PDF page dimensions
            width: `${overlayPosition.width || pdfPageRect.width}px`,
            height: `${overlayPosition.height || pdfPageRect.height}px`,
            pointerEvents: 'auto',
            transform: 'translateZ(0)',
            willChange: 'transform',
            backgroundColor: 'transparent',
            // Ensure no border, padding, or margin that could affect positioning
            border: 'none',
            padding: '0',
            margin: '0',
            boxSizing: 'border-box',
            // Debug: show outline in development to see overlay position
            ...(debugMode ? {
              outline: '1px dashed red',
              outlineOffset: '-1px',
            } : {}),
          }}
          data-overlay-container
        >
        {textElements.map((element, idx) => {
          // Recalculate element position relative to overlay to ensure perfect alignment
          // Since the overlay (red outline) is correctly positioned, we need to ensure
          // elements are positioned correctly relative to it
          let adjustedElement = element;
          
          if (typeof window !== 'undefined' && overlayPosition) {
            // Find the corresponding span in the DOM to get the actual position
            // Use the SAME coordinate reference as used during extraction
            const textLayer = document.querySelector('.react-pdf__Page__textContent');
            // Get the coordinate reference - same logic as extraction
            const canvasContainer = document.querySelector('.canvas-container');
            const pdfPage = document.querySelector('.react-pdf__Page');
            const refElement = canvasContainer || pdfPage;
            const refRect = refElement ? refElement.getBoundingClientRect() : null;
            const containerRect = containerRef.current?.getBoundingClientRect();
            
            // Verify overlay position matches the reference
            if (refRect && containerRect && debugMode && idx < 3) {
              const expectedOverlayLeft = refRect.left - containerRect.left;
              const expectedOverlayTop = refRect.top - containerRect.top;
              console.log(`Element ${idx} coordinate check:`, {
                refElement: canvasContainer ? 'canvas-container' : 'react-pdf__Page',
                refRect: { left: refRect.left.toFixed(2), top: refRect.top.toFixed(2) },
                containerRect: { left: containerRect.left.toFixed(2), top: containerRect.top.toFixed(2) },
                overlayPosition: { left: overlayPosition.left.toFixed(2), top: overlayPosition.top.toFixed(2) },
                expectedOverlay: { left: expectedOverlayLeft.toFixed(2), top: expectedOverlayTop.toFixed(2) },
                overlayMatches: Math.abs(overlayPosition.left - expectedOverlayLeft) < 1 && 
                               Math.abs(overlayPosition.top - expectedOverlayTop) < 1
              });
            }
            
            if (textLayer && refRect && containerRect) {
              const spans = textLayer.querySelectorAll('span');
              let bestMatch: { span: HTMLSpanElement; score: number } | null = null;
              
              // Try to find the best matching span for this element
              const elementText = element.text.trim().toLowerCase();
              const elementWords = elementText.split(/\s+/).filter(w => w.length > 0);
              
              // Calculate expected position in viewport
              const expectedX = containerRect.left + overlayPosition.left + element.x;
              const expectedY = containerRect.top + overlayPosition.top + element.y;
              
              for (const span of spans) {
                const spanText = (span.textContent || '').trim().toLowerCase();
                if (!spanText) continue;
                
                const spanRect = span.getBoundingClientRect();
                const xDiff = Math.abs(spanRect.left - expectedX);
                const yDiff = Math.abs(spanRect.top - expectedY);
                
                // Calculate match score based on text similarity AND position proximity
                let score = 0;
                
                // Position proximity is very important - prioritize spans that are close to expected position
                // If position is very close (within 10px), give high priority
                if (xDiff < 10 && yDiff < 10) {
                  score = 2000; // Very high priority for close matches
                } else if (xDiff < 20 && yDiff < 20) {
                  score = 1500;
                } else if (xDiff < 50 && yDiff < 50) {
                  score = 1000;
                }
                
                // Text matching adds to the score
                // Exact match gets highest text score
                if (spanText === elementText) {
                  score += 1000;
                }
                // Check if element text starts with span text or vice versa
                else if (elementText.startsWith(spanText) || spanText.startsWith(elementText)) {
                  score += 500;
                }
                // Check word overlap
                else {
                  const spanWords = spanText.split(/\s+/).filter(w => w.length > 0);
                  const commonWords = elementWords.filter(w => spanWords.includes(w));
                  score += commonWords.length * 10;
                  
                  // Also check if there's significant text overlap
                  const minLength = Math.min(elementText.length, spanText.length);
                  const maxLength = Math.max(elementText.length, spanText.length);
                  if (minLength > 0 && maxLength > 0) {
                    // Simple substring matching
                    if (elementText.includes(spanText.substring(0, Math.min(20, spanText.length))) ||
                        spanText.includes(elementText.substring(0, Math.min(20, elementText.length)))) {
                      score += 50;
                    }
                  }
                }
                
                // Add position proximity bonus (even if already included in base score)
                if (xDiff < 50 && yDiff < 50) {
                  score += Math.max(0, 100 - (xDiff + yDiff));
                }
                
                if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                  bestMatch = { span, score };
                }
              }
              
              if (bestMatch && bestMatch.score > 10 && refRect) {
                const spanRect = bestMatch.span.getBoundingClientRect();
                
                // Calculate position relative to overlay
                // Overlay is positioned at: refRect.left - containerRect.left, refRect.top - containerRect.top
                // So overlay's viewport position is: refRect.left, refRect.top
                // Span is at: spanRect.left, spanRect.top (viewport coordinates)
                // Element should be at: spanRect.left - refRect.left (relative to overlay)
                // This matches the extraction logic: viewportY = spanRect.top - pdfPageElementRect.top
                const fineTuneX = 0; // Adjust if needed (positive = move right, negative = move left)
                const fineTuneY = 0; // Adjust if needed (positive = move down, negative = move up)
                const adjustedX = spanRect.left - refRect.left + fineTuneX;
                const adjustedY = spanRect.top - refRect.top + fineTuneY;
                
                // Get font properties from the matched span for accuracy
                const spanStyle = window.getComputedStyle(bestMatch.span);
                const spanFontSize = parseFloat(spanStyle.fontSize) || element.fontSize;
                
                // Always use the adjusted position for perfect alignment
                // The original element.x/y might be slightly off due to timing or coordinate issues
                adjustedElement = {
                  ...element,
                  x: adjustedX,
                  y: adjustedY,
                  width: spanRect.width,
                  height: spanRect.height,
                  fontSize: spanFontSize // Use actual rendered font size from DOM
                };
                
                // Log the adjustment for debugging
                if (debugMode && idx < 3) {
                  const diffX = adjustedX - element.x;
                  const diffY = adjustedY - element.y;
                  console.log(`Adjusted element ${idx} position:`, {
                    elementText: element.text.substring(0, 30),
                    spanText: (bestMatch.span.textContent || '').trim().substring(0, 30),
                    matchScore: bestMatch.score,
                    original: { x: element.x.toFixed(2), y: element.y.toFixed(2) },
                    adjusted: { x: adjustedX.toFixed(2), y: adjustedY.toFixed(2) },
                    difference: { x: diffX.toFixed(2), y: diffY.toFixed(2) },
                    spanViewport: { left: spanRect.left.toFixed(2), top: spanRect.top.toFixed(2) },
                    overlayPosition: { left: overlayPosition.left.toFixed(2), top: overlayPosition.top.toFixed(2) },
                    containerPosition: { left: containerRect.left.toFixed(2), top: containerRect.top.toFixed(2) },
                    calculatedFinal: {
                      x: (containerRect.left + overlayPosition.left + adjustedX).toFixed(2),
                      y: (containerRect.top + overlayPosition.top + adjustedY).toFixed(2)
                    },
                    spanViewportActual: {
                      x: spanRect.left.toFixed(2),
                      y: spanRect.top.toFixed(2)
                    },
                    positionMatch: {
                      xMatch: Math.abs(spanRect.left - (containerRect.left + overlayPosition.left + adjustedX)) < 1,
                      yMatch: Math.abs(spanRect.top - (containerRect.top + overlayPosition.top + adjustedY)) < 1
                    },
                    fineTune: { x: fineTuneX, y: fineTuneY }
                  });
                }
              } else if (debugMode && idx < 3) {
                console.log(`No good match found for element ${idx}:`, {
                  elementText: element.text.substring(0, 30),
                  bestMatchScore: bestMatch?.score || 0,
                  note: 'Using original position'
                });
              }
            }
          }
          
          return (
            <EditableTextElement
              key={element.id}
              element={adjustedElement}
              onTextChange={handleTextChange}
            />
          );
        })}
        </div>
      )}
      
      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-0 left-0 bg-black bg-opacity-75 text-white text-xs p-2 z-30">
          <div>Text Elements: {textElements.length}</div>
          <div>PDF Page Rect: {pdfPageRect ? `${pdfPageRect.width}x${pdfPageRect.height}` : 'null'}</div>
          <div>Overlay Position: {overlayPosition ? `${overlayPosition.left.toFixed(0)}, ${overlayPosition.top.toFixed(0)}` : 'null'}</div>
          <div>Is Extracting: {isExtracting ? 'Yes' : 'No'}</div>
          <button 
            onClick={() => setDebugMode(!debugMode)}
            className="mt-2 px-2 py-1 bg-blue-600 text-white rounded text-xs"
          >
            Debug: {debugMode ? 'ON' : 'OFF'}
          </button>
        </div>
      )}
      
      {/* Visual debug overlay - show original spans and our inputs side by side */}
      {debugMode && !isExtracting && textElements.length > 0 && (
        <div className="absolute top-0 right-0 bg-yellow-200 bg-opacity-90 p-2 z-40 max-w-xs text-xs">
          <div className="font-bold mb-2">Alignment Debug Mode</div>
          <div className="mb-2">
            <div className="text-red-600">Red outline = Original span</div>
            <div className="text-blue-600">Blue outline = Our input</div>
          </div>
          <div className="text-xs text-gray-600">
            Check console for position differences
          </div>
        </div>
      )}
    </div>
  );
}

