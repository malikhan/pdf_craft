'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';

interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  originalText: string;
  pageWidth: number;
  pageHeight: number;
  backgroundColor?: string;
  color?: string;
  letterSpacing?: string;
  textDecoration?: string;
  textTransform?: string;
  lineHeight?: string;
}

interface ImageElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  pageWidth: number;
  pageHeight: number;
}

interface PdfTextEditorCleanProps {
  pdfFile: File | ArrayBuffer | null;
  currentPage: number;
  onTextChange: (elements: TextElement[]) => void;
  pageWidth: number;
  pageHeight: number;
}

export default function PdfTextEditorClean({
  pdfFile,
  currentPage,
  onTextChange,
  pageWidth,
  pageHeight,
}: PdfTextEditorCleanProps) {
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [imageElements, setImageElements] = useState<ImageElement[]>([]);
  const [pageBackgroundImage, setPageBackgroundImage] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedPageWidth, setExtractedPageWidth] = useState<number | null>(null);
  const [extractedPageHeight, setExtractedPageHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfViewerRef = useRef<HTMLDivElement>(null);
  const onTextChangeRef = useRef(onTextChange);
  
  // Debug: Log state changes
  useEffect(() => {
    console.log('State update:', {
      textElementsCount: textElements.length,
      imageElementsCount: imageElements.length,
      isExtracting,
      pageWidth,
      pageHeight
    });
  }, [textElements, imageElements, isExtracting, pageWidth, pageHeight]);
  
  // Update ref when callback changes
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

  // Set up pdfjs worker
  useEffect(() => {
    if (typeof window !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
  }, []);

  // Inject CSS to hide scrollbars and ensure transparent backgrounds on textarea elements
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .pdf-text-editor textarea::-webkit-scrollbar {
        display: none;
      }
      .pdf-text-editor textarea {
        background-color: transparent !important;
        -webkit-appearance: none;
        -moz-appearance: textfield;
        appearance: none;
      }
      .pdf-text-editor textarea:not(:focus) {
        background-color: transparent !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Extract text from PDF
  useEffect(() => {
    if (!pdfFile) {
      console.log('No PDF file, clearing elements');
      setTextElements([]);
      setImageElements([]);
      return;
    }

    console.log('Starting extraction for page:', currentPage);
    setIsExtracting(true);

    const extractText = async () => {
      try {
        // Wait for react-pdf to render the text layer so we can get actual DOM styles
        // Retry a few times to ensure text layer is rendered
        let textLayer: Element | null = null;
        let pdfPageElement: Element | null = null;
        
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 300 + attempt * 200));
          textLayer = document.querySelector('.react-pdf__Page__textContent');
          pdfPageElement = document.querySelector('.react-pdf__Page');
          
          if (textLayer && pdfPageElement) {
            const testSpans = textLayer.querySelectorAll('span');
            console.log(`Attempt ${attempt + 1}: Found ${testSpans.length} spans`);
            if (testSpans.length > 0) {
              console.log('Text layer found with spans, proceeding with extraction');
              break; // Found text layer with spans
            }
          } else {
            console.log(`Attempt ${attempt + 1}: Text layer or PDF page not found yet`);
          }
        }

        if (!textLayer || !pdfPageElement) {
          console.warn('Text layer not found after retries, using fallback extraction');
          // Fallback to PDF.js extraction
          return extractWithPdfJs();
        }
        
        const spans = textLayer.querySelectorAll('span');
        if (spans.length === 0) {
          console.warn('No spans found in text layer, using fallback extraction');
          return extractWithPdfJs();
        }

        const pdfPageRect = pdfPageElement.getBoundingClientRect();
        
        console.log(`Extracting from ${spans.length} spans, PDF page rect:`, {
          width: pdfPageRect.width,
          height: pdfPageRect.height,
          left: pdfPageRect.left,
          top: pdfPageRect.top
        });
        
        const elements: TextElement[] = [];
        const images: ImageElement[] = [];
        let idCounter = 0;
        let imageIdCounter = 0;

        // Extract text and ACTUAL styles from DOM spans (most accurate)
        console.log(`Processing ${spans.length} spans...`);
        let processedCount = 0;
        for (const span of spans) {
          const spanText = (span.textContent || '').trim();
          if (!spanText) {
            console.log('Skipping empty span');
            continue;
          }
          processedCount++;

          const spanRect = span.getBoundingClientRect();
          const spanStyle = window.getComputedStyle(span);
          
          // Get ALL ACTUAL styles from DOM - extract everything exactly as rendered
          // The hidden viewer is at scale 1.0, so these are the actual PDF font sizes
          const actualFontSize = parseFloat(spanStyle.fontSize) || 12;
          // Get the full font family string, not just the first one
          const actualFontFamily = spanStyle.fontFamily || 'Arial, sans-serif';
          const actualFontWeight = spanStyle.fontWeight;
          const actualFontStyle = spanStyle.fontStyle;
          const actualColor = spanStyle.color;
          const actualLetterSpacing = spanStyle.letterSpacing;
          const actualTextDecoration = spanStyle.textDecoration;
          const actualTextTransform = spanStyle.textTransform;
          const actualLineHeight = spanStyle.lineHeight;
          
          // Log first few spans for debugging
          if (idCounter < 3) {
            console.log(`Span ${idCounter} styles:`, {
              text: spanText.substring(0, 30),
              fontSize: actualFontSize,
              fontFamily: actualFontFamily,
              fontWeight: actualFontWeight,
              fontStyle: actualFontStyle,
              color: actualColor,
              letterSpacing: actualLetterSpacing,
              lineHeight: actualLineHeight,
              rect: { width: spanRect.width, height: spanRect.height }
            });
          }
          
          // Helper function to check if a color is transparent/empty
          const isTransparent = (color: string) => {
            if (!color || color === 'transparent') return true;
            if (color === 'rgba(0, 0, 0, 0)' || color === 'rgb(0, 0, 0)') return true;
            // Check rgba with alpha 0
            const rgbaMatch = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (rgbaMatch && parseFloat(rgbaMatch[4]) === 0) return true;
            return false;
          };
          
          // Check for background color on span and parent elements (more thorough)
          let actualBackgroundColor = spanStyle.backgroundColor;
          
          // First check the span itself
          if (isTransparent(actualBackgroundColor)) {
            // Check all parent elements up to the text layer
            let parent = span.parentElement;
            let depth = 0;
            while (parent && parent !== textLayer && depth < 10) {
              const parentStyle = window.getComputedStyle(parent);
              const parentBg = parentStyle.backgroundColor;
              
              // Check if parent has a non-transparent background
              if (!isTransparent(parentBg)) {
                actualBackgroundColor = parentBg;
                break;
              }
              
              // Also check for background-image (some PDFs use this)
              const bgImage = parentStyle.backgroundImage;
              if (bgImage && bgImage !== 'none') {
                // Try to extract color from background-image if it's a gradient or solid color
                const colorMatch = bgImage.match(/rgba?\([^)]+\)/);
                if (colorMatch) {
                  actualBackgroundColor = colorMatch[0];
                  break;
                }
              }
              
              parent = parent.parentElement;
              depth++;
            }
          }
          
          // Also check inline styles directly on the element
          if (isTransparent(actualBackgroundColor) && span instanceof HTMLElement) {
            const inlineBg = span.style.backgroundColor;
            if (inlineBg && !isTransparent(inlineBg)) {
              actualBackgroundColor = inlineBg;
            }
          }
          
          // Check parent elements for inline styles too
          if (isTransparent(actualBackgroundColor)) {
            let parent = span.parentElement;
            while (parent && parent !== textLayer && parent instanceof HTMLElement) {
              const inlineBg = parent.style.backgroundColor;
              if (inlineBg && !isTransparent(inlineBg)) {
                actualBackgroundColor = inlineBg;
                break;
              }
              parent = parent.parentElement;
            }
          }
          
          // DISABLED: Canvas pixel sampling is unreliable and can pick up text colors
          // Only use CSS-computed background colors from styles, not canvas sampling
          // Canvas sampling often picks up anti-aliasing artifacts or text pixels, causing incorrect colors
          
          // Log background color extraction for first few spans
          if (idCounter < 3) {
            console.log(`Span ${idCounter} background extraction:`, {
              spanBg: spanStyle.backgroundColor,
              extractedBg: actualBackgroundColor,
              isTransparent: isTransparent(actualBackgroundColor)
            });
          }
          
          // Calculate position relative to PDF page element
          const x = spanRect.left - pdfPageRect.left;
          const y = spanRect.top - pdfPageRect.top;
          
          elements.push({
            id: `text-${idCounter++}`,
            text: spanText,
            x: x,
            y: y,
            width: spanRect.width,
            height: spanRect.height,
            fontSize: actualFontSize,
            fontFamily: actualFontFamily,
            fontWeight: actualFontWeight,
            fontStyle: actualFontStyle,
            color: actualColor,
            letterSpacing: actualLetterSpacing !== 'normal' ? actualLetterSpacing : undefined,
            textDecoration: actualTextDecoration !== 'none' ? actualTextDecoration : undefined,
            textTransform: actualTextTransform !== 'none' ? actualTextTransform : undefined,
            lineHeight: actualLineHeight !== 'normal' ? actualLineHeight : undefined,
            backgroundColor: !isTransparent(actualBackgroundColor) && actualBackgroundColor
              ? actualBackgroundColor 
              : undefined,
            originalText: spanText,
            pageWidth: pdfPageRect.width,
            pageHeight: pdfPageRect.height,
          });
        }

        // Extract page background image (render entire page as image)
        // This captures all background images, graphics, and styling
        try {
          let pdfData: ArrayBuffer | Uint8Array;
          if (pdfFile instanceof File) {
            pdfData = await pdfFile.arrayBuffer();
          } else if (pdfFile instanceof ArrayBuffer) {
            pdfData = pdfFile;
          } else {
            throw new Error('Invalid PDF file format');
          }

          const loadingTask = pdfjsLib.getDocument({ data: pdfData });
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(currentPage);
          const viewport = page.getViewport({ scale: 1.0 });
          
          // Render the entire page to canvas to get background with all images
          // CRITICAL: Use the EXACT same dimensions as the extracted page for perfect alignment
          console.log('Rendering PDF page to canvas for background image...');
          console.log('PDF.js viewport dimensions:', { width: viewport.width, height: viewport.height });
          console.log('Extracted PDF page rect dimensions:', { width: pdfPageRect.width, height: pdfPageRect.height });
          
          // The text positions are extracted relative to pdfPageRect
          // So the background image MUST be rendered at the exact same dimensions
          const backgroundScale = pdfPageRect.width / viewport.width;
          const renderViewport = page.getViewport({ scale: backgroundScale });
          
          console.log('Background render viewport:', {
            scale: backgroundScale,
            width: renderViewport.width,
            height: renderViewport.height,
            matchesExtracted: renderViewport.width === pdfPageRect.width && renderViewport.height === pdfPageRect.height
          });
          
          const renderCanvas = document.createElement('canvas');
          renderCanvas.width = pdfPageRect.width;  // Use EXACT extracted width
          renderCanvas.height = pdfPageRect.height; // Use EXACT extracted height
          const renderContext = renderCanvas.getContext('2d', { willReadFrequently: true });
          
          if (renderContext) {
            // Render the page (this includes all background images and text)
            // This MUST match the dimensions used for text extraction
            await page.render({ canvasContext: renderContext, viewport: renderViewport }).promise;
            
            // Cover all original text areas with rectangles matching their original background colors
            // This preserves the original PDF appearance while hiding the text
            console.log(`Covering ${elements.length} text areas with background-colored rectangles...`);
            
            for (const element of elements) {
              // Sample the background color from the rendered canvas at the text position
              // This ensures we use the actual background color from the PDF, not just CSS
              let coverColor = '#ffffff'; // Default to white
              
              // Try to sample the actual background color from the canvas
              // Sample a few pixels around the text area to get the background
              const sampleX = Math.max(0, Math.min(element.x - 5, renderCanvas.width - 1));
              const sampleY = Math.max(0, Math.min(element.y - 5, renderCanvas.height - 1));
              const imageData = renderContext.getImageData(sampleX, sampleY, 1, 1);
              
              if (imageData && imageData.data.length >= 4) {
                const r = imageData.data[0];
                const g = imageData.data[1];
                const b = imageData.data[2];
                const a = imageData.data[3] / 255;
                
                // Use sampled color if it's not too dark (likely background, not text)
                if (r + g + b > 200) {
                  coverColor = `rgb(${r}, ${g}, ${b})`;
                }
              }
              
              // Fallback to extracted background color from CSS if available
              if (coverColor === '#ffffff' && element.backgroundColor && 
                  !element.backgroundColor.includes('transparent') &&
                  element.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                const rgbMatch = element.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (rgbMatch) {
                  const r = parseInt(rgbMatch[1]);
                  const g = parseInt(rgbMatch[2]);
                  const b = parseInt(rgbMatch[3]);
                  
                  // Only use if it's a light/colored background (not dark text)
                  if (r + g + b > 300) {
                    if (element.backgroundColor.startsWith('rgb')) {
                      coverColor = element.backgroundColor.replace('rgba', 'rgb').replace(/,\s*[\d.]+\s*\)/, ')');
                    } else if (element.backgroundColor.startsWith('#')) {
                      coverColor = element.backgroundColor;
                    }
                  }
                }
              }
              
              // Draw rectangle to cover the original text with the sampled/calculated background color
              renderContext.fillStyle = coverColor;
              const padding = 3; // Slightly more padding to ensure full coverage
              renderContext.fillRect(
                Math.max(0, element.x - padding),
                Math.max(0, element.y - padding),
                Math.min(element.width + (padding * 2), renderCanvas.width - (element.x - padding)),
                Math.min(element.height + (padding * 2), renderCanvas.height - (element.y - padding))
              );
            }
            
            console.log(`✅ Covered ${elements.length} text areas`);
            
            const backgroundImageUrl = renderCanvas.toDataURL('image/png');
            console.log('✅ Page background image created (with text covered):', {
              canvasSize: `${renderCanvas.width}x${renderCanvas.height}`,
              viewportSize: `${renderViewport.width}x${renderViewport.height}`,
              extractedSize: `${pdfPageRect.width}x${pdfPageRect.height}`,
              imageSize: backgroundImageUrl.length,
              dimensionsMatch: renderCanvas.width === pdfPageRect.width && renderCanvas.height === pdfPageRect.height,
              textAreasCovered: elements.length
            });
            setPageBackgroundImage(backgroundImageUrl);
          }
          
          // Note: Individual image extraction removed since images are part of background
          // The background image above contains all images
          
          // Keep individual image extraction for reference, but it won't find background images
          console.log('Skipping individual image extraction - images are part of background');
          const operatorList = await page.getOperatorList();
          console.log('Operator list length:', operatorList.fnArray.length);
          
          // Track current transform matrix and graphics state
          let currentTransform = [1, 0, 0, 1, 0, 0];
          const imageOps: Array<{ index: number; imageName: string; transform: number[] }> = [];
          
          // First pass: collect all image operations with their transforms
          for (let i = 0; i < operatorList.fnArray.length; i++) {
            const op = operatorList.fnArray[i];
            const args = operatorList.argsArray[i];
            
            if (op === pdfjsLib.OPS.transform || op === pdfjsLib.OPS.concatTransform) {
              if (args && args.length >= 6) {
                currentTransform = args;
              }
            } else if (op === pdfjsLib.OPS.paintImageXObject || 
                       op === pdfjsLib.OPS.paintJpegXObject ||
                       op === pdfjsLib.OPS.paintXObject ||
                       op === pdfjsLib.OPS.paintInlineImageXObject) {
              if (args && args.length > 0 && args[0]) {
                imageOps.push({
                  index: i,
                  imageName: args[0],
                  transform: [...currentTransform] // Copy current transform
                });
              }
            }
          }
          
          console.log(`Found ${imageOps.length} image operations in operator list`);
          
          // Second pass: extract each image
          for (const imgOp of imageOps) {
            try {
              console.log(`Processing image operation: ${imgOp.imageName} at index ${imgOp.index}`);
              
              // Get image object - this is async
              const imageObj = await page.objs.get(imgOp.imageName);
              console.log(`Retrieved image object for ${imgOp.imageName}:`, {
                hasData: !!imageObj?.data,
                width: imageObj?.width,
                height: imageObj?.height,
                kind: imageObj?.kind,
                dataType: imageObj?.data ? typeof imageObj.data : 'none',
                dataConstructor: imageObj?.data?.constructor?.name,
                hasGetBytes: typeof imageObj?.getBytes === 'function',
                hasToDataURL: typeof imageObj?.toDataURL === 'function',
                allKeys: imageObj ? Object.keys(imageObj) : [],
                fullObject: imageObj
              });
              
              if (!imageObj) {
                console.warn(`Image object is null for ${imgOp.imageName}`);
                continue;
              }
              
              let imageUrl: string | null = null;
              let imgWidth = imageObj.width || 0;
              let imgHeight = imageObj.height || 0;
              
              // Method 1: Try toDataURL if available
              if (typeof imageObj.toDataURL === 'function') {
                try {
                  imageUrl = await imageObj.toDataURL();
                  console.log(`Got image URL from toDataURL() for ${imgOp.imageName}`);
                } catch (toDataURLError) {
                  console.warn(`toDataURL() failed for ${imgOp.imageName}:`, toDataURLError);
                }
              }
              
              // Method 2: Try data property (ImageData or pixel array)
              if (!imageUrl && imageObj.data) {
                console.log(`Image ${imgOp.imageName} has data property, type:`, imageObj.data.constructor?.name);
                const canvas = document.createElement('canvas');
                canvas.width = imgWidth;
                canvas.height = imgHeight;
                const ctx = canvas.getContext('2d');
                
                if (ctx) {
                  if (imageObj.data instanceof ImageData) {
                    ctx.putImageData(imageObj.data, 0, 0);
                    imageUrl = canvas.toDataURL('image/png');
                    console.log(`Created image URL from ImageData for ${imgOp.imageName}`);
                  } else if (imageObj.data instanceof Uint8ClampedArray || imageObj.data instanceof Uint8Array) {
                    // Check if it's RGBA data (4 bytes per pixel)
                    const expectedLength = imgWidth * imgHeight * 4;
                    if (imageObj.data.length === expectedLength) {
                      const canvasImageData = ctx.createImageData(imgWidth, imgHeight);
                      canvasImageData.data.set(imageObj.data);
                      ctx.putImageData(canvasImageData, 0, 0);
                      imageUrl = canvas.toDataURL('image/png');
                      console.log(`Created image URL from Uint8Array for ${imgOp.imageName}`);
                    } else {
                      console.warn(`Image data length mismatch: expected ${expectedLength}, got ${imageObj.data.length}`);
                      // Try anyway - might be different format
                      try {
                        const canvasImageData = ctx.createImageData(imgWidth, imgHeight);
                        const dataLength = Math.min(imageObj.data.length, canvasImageData.data.length);
                        canvasImageData.data.set(imageObj.data.subarray(0, dataLength));
                        ctx.putImageData(canvasImageData, 0, 0);
                        imageUrl = canvas.toDataURL('image/png');
                        console.log(`Created image URL from Uint8Array (partial) for ${imgOp.imageName}`);
                      } catch (partialError) {
                        console.warn(`Failed to create image from partial data:`, partialError);
                      }
                    }
                  }
                }
              }
              
              // Method 3: Try getBytes() method
              if (!imageUrl && typeof imageObj.getBytes === 'function') {
                try {
                  console.log(`Trying getBytes() for ${imgOp.imageName}...`);
                  const bytes = await imageObj.getBytes();
                  console.log(`Got bytes for ${imgOp.imageName}, length:`, bytes?.length);
                  
                  if (bytes && bytes.length > 0) {
                    // Detect image format from magic bytes
                    const uint8 = new Uint8Array(bytes);
                    let mimeType = 'image/jpeg'; // default
                    
                    if (uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47) {
                      mimeType = 'image/png';
                    } else if (uint8[0] === 0xFF && uint8[1] === 0xD8) {
                      mimeType = 'image/jpeg';
                    } else if (uint8[0] === 0x47 && uint8[1] === 0x49 && uint8[2] === 0x46) {
                      mimeType = 'image/gif';
                    }
                    
                    const blob = new Blob([bytes], { type: mimeType });
                    imageUrl = URL.createObjectURL(blob);
                    
                    // Load image to get dimensions if not available
                    if (imgWidth === 0 || imgHeight === 0) {
                      const img = new Image();
                      await new Promise((resolve, reject) => {
                        img.onload = () => {
                          imgWidth = img.width;
                          imgHeight = img.height;
                          console.log(`Image ${imgOp.imageName} dimensions from bytes:`, imgWidth, 'x', imgHeight);
                          resolve(null);
                        };
                        img.onerror = reject;
                        img.src = imageUrl!;
                      });
                    }
                    console.log(`Created image URL from bytes for ${imgOp.imageName}`);
                  }
                } catch (bytesError) {
                  console.warn(`Error getting bytes for ${imgOp.imageName}:`, bytesError);
                }
              }
              
              // Method 4: Try render method
              if (!imageUrl && typeof imageObj.render === 'function') {
                try {
                  console.log(`Trying render() for ${imgOp.imageName}...`);
                  const canvas = document.createElement('canvas');
                  canvas.width = imgWidth || 100;
                  canvas.height = imgHeight || 100;
                  const ctx = canvas.getContext('2d');
                  
                  if (ctx) {
                    await imageObj.render(ctx);
                    imageUrl = canvas.toDataURL('image/png');
                    console.log(`Created image URL from render() for ${imgOp.imageName}`);
                  }
                } catch (renderError) {
                  console.warn(`Error rendering image ${imgOp.imageName}:`, renderError);
                }
              }
              
              if (imageUrl && imgWidth > 0 && imgHeight > 0) {
                // Calculate position from transform matrix
                const x = imgOp.transform[4] || 0;
                const y = viewport.height - (imgOp.transform[5] || 0) - (Math.abs(imgOp.transform[3] || 1) * imgHeight);
                const width = Math.abs(imgOp.transform[0] || 1) * imgWidth;
                const height = Math.abs(imgOp.transform[3] || 1) * imgHeight;
                
                images.push({
                  id: `image-${imageIdCounter++}`,
                  x: x,
                  y: y,
                  width: width,
                  height: height,
                  src: imageUrl,
                  pageWidth: pdfPageRect.width,
                  pageHeight: pdfPageRect.height,
                });
                
                console.log('✅ Successfully extracted image:', {
                  id: images[images.length - 1].id,
                  name: imgOp.imageName,
                  x, y, width, height,
                  srcLength: imageUrl.length,
                  srcPreview: imageUrl.substring(0, 50)
                });
              } else {
                console.warn(`❌ Could not extract image data for ${imgOp.imageName}:`, {
                  hasImageUrl: !!imageUrl,
                  imgWidth,
                  imgHeight,
                  imageObjKeys: Object.keys(imageObj || {})
                });
              }
            } catch (imgError) {
              console.error(`❌ Error extracting image ${imgOp.imageName}:`, imgError);
            }
          }
          
          // Method 2: Try rendering page to canvas and extracting image regions
          if (images.length === 0) {
            console.log('Method 2: No images found via operator list, trying canvas rendering...');
            try {
              const renderCanvas = document.createElement('canvas');
              renderCanvas.width = viewport.width;
              renderCanvas.height = viewport.height;
              const renderContext = renderCanvas.getContext('2d', { willReadFrequently: true });
              
              if (renderContext) {
                await page.render({ canvasContext: renderContext, viewport: viewport }).promise;
                console.log('Rendered page to canvas, size:', renderCanvas.width, 'x', renderCanvas.height);
                
                // Note: This gives us the whole page as an image
                // We can't easily extract individual images from this without image detection algorithms
                // But we can at least verify the page renders correctly
                const pageImageUrl = renderCanvas.toDataURL('image/png');
                console.log('Page rendered successfully, image data URL length:', pageImageUrl.length);
                
                // For now, we'll skip this method as it doesn't give us individual image positions
                // In the future, we could use image detection algorithms to find image regions
              }
            } catch (renderError) {
              console.warn('Error rendering page to canvas:', renderError);
            }
          }
          
          console.log(`Image extraction complete: Found ${images.length} images from ${imageOps.length} image operations`);
          
          // Diagnostic: Log all operator types to see what's in the PDF
          if (images.length === 0 && imageOps.length === 0) {
            console.log('🔍 DIAGNOSTIC: No images found. Analyzing operator list...');
            const operatorTypes = new Map<number, number>();
            for (let i = 0; i < operatorList.fnArray.length; i++) {
              const op = operatorList.fnArray[i];
              operatorTypes.set(op, (operatorTypes.get(op) || 0) + 1);
            }
            
            // Log all unique operators
            const uniqueOps: Array<{ name: string; count: number; code: number }> = [];
            for (const [opCode, count] of operatorTypes.entries()) {
              let opName = 'UNKNOWN';
              for (const key in pdfjsLib.OPS) {
                if ((pdfjsLib.OPS as any)[key] === opCode) {
                  opName = key;
                  break;
                }
              }
              uniqueOps.push({ name: opName, count, code: opCode });
            }
            uniqueOps.sort((a, b) => b.count - a.count);
            console.log('Top 20 operators in PDF:', uniqueOps.slice(0, 20));
            
            // Check if there are any image-related operations with different names
            const imageOpCodes = [
              pdfjsLib.OPS.paintImageXObject,
              pdfjsLib.OPS.paintJpegXObject,
              pdfjsLib.OPS.paintXObject,
              pdfjsLib.OPS.paintInlineImageXObject,
            ];
            console.log('Image operation codes:', imageOpCodes);
            console.log('Looking for image operations in operator list...');
            for (let i = 0; i < Math.min(100, operatorList.fnArray.length); i++) {
              const op = operatorList.fnArray[i];
              if (imageOpCodes.includes(op)) {
                console.log(`Found image operation at index ${i}:`, {
                  op,
                  args: operatorList.argsArray[i],
                  opName: Object.keys(pdfjsLib.OPS).find(k => (pdfjsLib.OPS as any)[k] === op)
                });
              }
            }
          }
        } catch (error) {
          console.error('Error extracting images:', error);
        }

        // Group nearby text items into paragraphs
        const groupedElements = groupTextItems(elements);
        
        console.log(`Grouped into ${groupedElements.length} elements`);
        console.log('Page dimensions from extraction:', { 
          width: pdfPageRect.width, 
          height: pdfPageRect.height,
          pageWidth,
          pageHeight
        });
        console.log('First few elements:', groupedElements.slice(0, 3));
        
        if (groupedElements.length === 0) {
          console.warn('No text elements extracted, check PDF content');
        }
        
        // Store extracted dimensions for rendering
        setExtractedPageWidth(pdfPageRect.width);
        setExtractedPageHeight(pdfPageRect.height);
        
        console.log('Setting text elements and images...');
        setTextElements(groupedElements);
        setImageElements(images);
        console.log('State set, setting isExtracting to false');
        setIsExtracting(false);
        setTimeout(() => {
          console.log('Calling onTextChange with', groupedElements.length, 'elements');
          onTextChangeRef.current(groupedElements);
        }, 0);
      } catch (error) {
        console.error('Error extracting text:', error);
        setIsExtracting(false);
      }
    };

    // Fallback extraction using PDF.js (if DOM not available)
    const extractWithPdfJs = async () => {
      try {
        console.log('Using fallback PDF.js extraction');
        // Convert pdfFile to the format expected by pdfjs
        let pdfData: ArrayBuffer | Uint8Array;
        if (pdfFile instanceof File) {
          pdfData = await pdfFile.arrayBuffer();
        } else if (pdfFile instanceof ArrayBuffer) {
          pdfData = pdfFile;
        } else {
          throw new Error('Invalid PDF file format');
        }

        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(currentPage);
        const viewportScale = 1.0;
        const viewport = page.getViewport({ scale: viewportScale });
        const textContent = await page.getTextContent();
        
        console.log(`Fallback: Found ${textContent.items.length} text items`);
        
        const elements: TextElement[] = [];
        const images: ImageElement[] = [];
        let idCounter = 0;
        let imageIdCounter = 0;

        for (const item of textContent.items) {
          if (item.str && item.str.trim()) {
            const transform = item.transform;
            const x = transform[4];
            const pdfY = transform[5];
            const scaleX = Math.abs(transform[0]);
            const scaleY = Math.abs(transform[3]);
            const fontSize = Math.max(scaleX, scaleY) || item.height || 12;
            const y = viewport.height - pdfY;
            
            const fontName = item.fontName || 'Arial';
            const fontParts = fontName.split('-');
            let fontFamily = fontParts[0] || 'Arial';
            let fontWeight = 'normal';
            let fontStyle = 'normal';
            
            if (fontParts.length > 1) {
              const modifiers = fontParts[1].toLowerCase();
              if (modifiers.includes('bold')) fontWeight = 'bold';
              if (modifiers.includes('italic') || modifiers.includes('oblique')) fontStyle = 'italic';
            }

            elements.push({
              id: `text-${idCounter++}`,
              text: item.str,
              x: x,
              y: y,
              width: item.width || 0,
              height: fontSize,
              fontSize: fontSize,
              fontFamily: fontFamily,
              fontWeight: fontWeight,
              fontStyle: fontStyle,
              originalText: item.str,
              pageWidth: viewport.width,
              pageHeight: viewport.height,
            });
          }
        }

        console.log(`Fallback: Extracted ${elements.length} elements`);
        const groupedElements = groupTextItems(elements);
        console.log(`Fallback: Grouped into ${groupedElements.length} elements`);
        
        setTextElements(groupedElements);
        setImageElements(images);
        setIsExtracting(false);
        setTimeout(() => {
          onTextChangeRef.current(groupedElements);
        }, 0);
      } catch (error) {
        console.error('Error in fallback extraction:', error);
        setIsExtracting(false);
      }
    };

    // Smart paragraph grouping - balanced approach
    const groupTextItems = (items: TextElement[]): TextElement[] => {
      if (items.length === 0) return [];
      
      // Sort items by reading order: top to bottom, left to right
      const sorted = [...items].sort((a, b) => {
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) > 5) return yDiff; // Different lines if >5px apart
        return a.x - b.x; // Same line, sort by X
      });

      // Group items into lines first
      const lines: TextElement[][] = [];
      let currentLine: TextElement[] = [sorted[0]];
      
      const avgFontSize = sorted.reduce((sum, e) => sum + e.fontSize, 0) / sorted.length;
      const lineThreshold = Math.max(avgFontSize * 0.4, 8); // 40% of font size or 8px
      
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const yDiff = Math.abs(prev.y - curr.y);
        
        if (yDiff < lineThreshold) {
          currentLine.push(curr);
        } else {
          lines.push(currentLine);
          currentLine = [curr];
        }
      }
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
      
      // Now group lines into paragraphs
      const paragraphs: TextElement[][] = [];
      let currentParagraph: TextElement[] = [...lines[0]];
      
      // Calculate typical line spacing
      let typicalLineSpacing = avgFontSize * 1.5;
      if (lines.length > 1) {
        const spacings: number[] = [];
        for (let i = 1; i < Math.min(5, lines.length); i++) {
          const prevLine = lines[i - 1];
          const currLine = lines[i];
          const prevLineBottom = Math.max(...prevLine.map(e => e.y + e.height));
          const currLineTop = Math.min(...currLine.map(e => e.y));
          const gap = currLineTop - prevLineBottom;
          if (gap > 0 && gap < avgFontSize * 4) {
            spacings.push(gap);
          }
        }
        if (spacings.length > 0) {
          typicalLineSpacing = spacings.reduce((sum, s) => sum + s, 0) / spacings.length;
        }
      }
      
      for (let i = 1; i < lines.length; i++) {
        const prevLine = lines[i - 1];
        const currLine = lines[i];
        
        const prevLineBottom = Math.max(...prevLine.map(e => e.y + e.height));
        const currLineTop = Math.min(...currLine.map(e => e.y));
        const lineGap = currLineTop - prevLineBottom;
        
        const prevLineLeft = Math.min(...prevLine.map(e => e.x));
        const prevLineRight = Math.max(...prevLine.map(e => e.x + e.width));
        const currLineLeft = Math.min(...currLine.map(e => e.x));
        const currLineRight = Math.max(...currLine.map(e => e.x + e.width));
        
        // Check horizontal positioning
        const leftAlignmentDiff = Math.abs(prevLineLeft - currLineLeft);
        const horizontalGap = currLineLeft - prevLineRight;
        
        // Check vertical overlap - if lines overlap vertically, they might be in same column
        const prevLineTop = Math.min(...prevLine.map(e => e.y));
        const currLineBottom = Math.max(...currLine.map(e => e.y + e.height));
        const verticalOverlap = Math.min(prevLineBottom, currLineBottom) - Math.max(prevLineTop, currLineTop);
        const hasVerticalOverlap = verticalOverlap > 0;
        
        // Very strict condition: Only group if next line is directly below with NO gap or minimal gap
        // Use absolute pixel threshold - normal line spacing within paragraph is usually 2-5px
        // Any gap larger than 5px is likely a paragraph break
        const ABSOLUTE_GAP_THRESHOLD = 5; // pixels
        
        // Only group if gap is <= 5 pixels (very tight, normal line spacing)
        // This ensures we only group lines that are truly directly connected
        const isTightSpacing = lineGap <= ABSOLUTE_GAP_THRESHOLD;
        
        // Check if it's a different column (side-by-side paragraphs):
        // Be very strict - if there's significant horizontal separation, break even if vertical gap is small
        // This prevents items from different columns from being grouped together
        const isDifferentColumn = horizontalGap > 60 || // Large horizontal gap (different column)
                                  (leftAlignmentDiff > 60 && horizontalGap > 30) || // Misaligned and separated
                                  (horizontalGap > 40 && leftAlignmentDiff > 40); // Both horizontal gap and misalignment
        
        // Also check if font size is very different (likely a heading)
        const prevAvgFontSize = prevLine.reduce((sum, e) => sum + e.fontSize, 0) / prevLine.length;
        const currAvgFontSize = currLine.reduce((sum, e) => sum + e.fontSize, 0) / currLine.length;
        const fontSizeRatio = Math.max(prevAvgFontSize, currAvgFontSize) / Math.min(prevAvgFontSize, currAvgFontSize);
        const isHeading = fontSizeRatio > 1.5;
        
        // Only group if:
        // 1. Gap is very tight (<=5px) - meaning lines are directly connected, AND
        // 2. Not a different column, AND
        // 3. Not a heading
        // Otherwise, break into new paragraph
        const isParagraphBreak = !isTightSpacing || isDifferentColumn || isHeading;
        
        // Debug logging for all comparisons
        console.log(`Line ${i-1} -> ${i} comparison:`, {
          lineGap: lineGap.toFixed(2),
          threshold: ABSOLUTE_GAP_THRESHOLD,
          isTightSpacing,
          horizontalGap: horizontalGap.toFixed(2),
          verticalOverlap: verticalOverlap.toFixed(2),
          hasVerticalOverlap,
          leftAlignmentDiff: leftAlignmentDiff.toFixed(2),
          isDifferentColumn,
          fontSizeRatio: fontSizeRatio.toFixed(2),
          isHeading,
          isParagraphBreak,
          breakReason: !isTightSpacing ? 'gapTooLarge' : isDifferentColumn ? 'differentColumn' : isHeading ? 'heading' : 'sameParagraph'
        });
        
        if (isParagraphBreak) {
          paragraphs.push(currentParagraph);
          currentParagraph = [...currLine];
        } else {
          // No significant gap = same paragraph, continue grouping
          currentParagraph.push(...currLine);
        }
      }
      
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
      }
      
      console.log(`Grouped ${sorted.length} items into ${lines.length} lines, then into ${paragraphs.length} paragraphs`);


      // Convert paragraphs to TextElement objects
      const grouped: TextElement[] = [];
      let groupIdCounter = items.length;

      for (const paragraph of paragraphs) {
        if (paragraph.length === 0) continue;
        
        // Sort paragraph items by position
        paragraph.sort((a, b) => {
          const yDiff = a.y - b.y;
          if (Math.abs(yDiff) > 2) return yDiff;
          return a.x - b.x;
        });

        // Calculate paragraph bounds
        const minX = Math.min(...paragraph.map(e => e.x));
        const maxX = Math.max(...paragraph.map(e => e.x + e.width));
        const minY = Math.min(...paragraph.map(e => e.y));
        const maxY = Math.max(...paragraph.map(e => e.y + e.height));
        
        // Safety check: If paragraph spans too wide (likely different columns), split it
        // Check if any item is significantly separated horizontally from others
        const paragraphWidth = maxX - minX;
        const avgItemWidth = paragraph.reduce((sum, e) => sum + e.width, 0) / paragraph.length;
        
        // If paragraph width is much larger than average item width, it might span columns
        // Split into separate items if width > 3x average item width
        if (paragraphWidth > avgItemWidth * 3 && paragraph.length > 1) {
          // Split paragraph - treat each item separately
          for (const item of paragraph) {
            grouped.push(item);
          }
          continue;
        }

        // Combine text intelligently
        const combinedText = paragraph
          .map((e, idx) => {
            if (idx === 0) return e.text;
            const prev = paragraph[idx - 1];
            const sameLine = Math.abs(e.y - prev.y) < 2;
            const horizontalGap = e.x - (prev.x + prev.width);
            
            if (sameLine && horizontalGap < 20) {
              // Same line, close together - use space
              return ` ${e.text}`;
            } else if (sameLine) {
              // Same line but far apart - might be separate elements
              return ` ${e.text}`;
            } else {
              // Different line - use newline
              return `\n${e.text}`;
            }
          })
          .join('');

        // Get common styles from paragraph - use most common font size
        const firstItem = paragraph[0];
        
        // Calculate average font size for the paragraph (more accurate than just using first item)
        const avgFontSize = paragraph.reduce((sum, e) => sum + e.fontSize, 0) / paragraph.length;
        
        // Find most common font family, weight, and style
        const fontFamilies = paragraph.map(e => e.fontFamily);
        const mostCommonFontFamily = fontFamilies.reduce((a, b, _, arr) => 
          arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b, fontFamilies[0]);
        
        const fontWeights = paragraph.map(e => e.fontWeight);
        const mostCommonFontWeight = fontWeights.reduce((a, b, _, arr) => 
          arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b, fontWeights[0]);
        
        const fontStyles = paragraph.map(e => e.fontStyle);
        const mostCommonFontStyle = fontStyles.reduce((a, b, _, arr) => 
          arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b, fontStyles[0]);
        
        const backgrounds = paragraph.map(e => e.backgroundColor).filter(Boolean);
        const commonBackground = backgrounds.length > 0 && backgrounds.every(bg => bg === backgrounds[0])
          ? backgrounds[0]
          : undefined;
        
        const colors = paragraph.map(e => e.color).filter(Boolean);
        const commonColor = colors.length > 0 && colors.every(c => c === colors[0])
          ? colors[0]
          : firstItem.color;

        if (paragraph.length === 1) {
          // Single item, use as-is
          grouped.push(paragraph[0]);
        } else {
          // Multiple items, create grouped element with average font size
          const groupedElement = {
            id: `text-group-${groupIdCounter++}`,
            text: combinedText,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            fontSize: avgFontSize, // Use average font size instead of first item's
            fontFamily: mostCommonFontFamily,
            fontWeight: mostCommonFontWeight,
            fontStyle: mostCommonFontStyle,
            color: commonColor,
            backgroundColor: commonBackground,
            originalText: combinedText,
            pageWidth: firstItem.pageWidth,
            pageHeight: firstItem.pageHeight,
          };
          
          // Log grouped element font size for debugging
          if (groupIdCounter <= 3) {
            console.log(`Grouped element ${groupIdCounter - 1}:`, {
              text: combinedText.substring(0, 30),
              fontSize: avgFontSize,
              fontSizes: paragraph.map(e => e.fontSize),
              fontFamily: mostCommonFontFamily,
              fontWeight: mostCommonFontWeight
            });
          }
          
          grouped.push(groupedElement);
        }
      }

      return grouped;
    };

    extractText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFile, currentPage]); // Remove onTextChange from dependencies to prevent infinite loop

  // Handle text changes
  const handleTextChange = useCallback((id: string, text: string) => {
    setTextElements(prev => {
      const updated = prev.map(el => 
        el.id === id ? { ...el, text } : el
      );
      // Use ref to avoid dependency issues
      setTimeout(() => {
        onTextChangeRef.current(updated);
      }, 100);
      return updated;
    });
  }, []);

  // Use extracted dimensions if available, otherwise use props
  const actualPageWidth = extractedPageWidth || pageWidth || 612;
  const actualPageHeight = extractedPageHeight || pageHeight || 792;
  
  // Calculate scale to fit container - prioritize width to make page wider
  const scale = useMemo(() => {
    // Use extracted dimensions if available
    const width = extractedPageWidth || pageWidth;
    const height = extractedPageHeight || pageHeight;
    
    // Use a default scale if page dimensions aren't available yet
    if (!width || !height || width === 0 || height === 0) {
      console.warn('Page dimensions not available, using default scale 1.0');
      return 1.0;
    }
    if (!containerRef.current) {
      console.warn('Container ref not available, using default scale 1.0');
      return 1.0;
    }
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    if (containerWidth === 0 || containerHeight === 0) {
      console.warn('Container dimensions are 0, using default scale 1.0');
      return 1.0;
    }
    const scaleX = containerWidth / width;
    const scaleY = containerHeight / height;
    
    // Prioritize width to match actual PDF page size - use scaleX to fill container width
    // This ensures the page width matches the PDF and allows vertical scrolling
    const calculatedScale = scaleX;
    
    // Log detailed scale information for debugging
    console.log('Detailed scale calculation:', {
      pdfWidth: width,
      pdfHeight: height,
      containerWidth,
      containerHeight,
      scaleX,
      scaleY,
      calculatedScale,
      resultingWidth: width * calculatedScale,
      resultingHeight: height * calculatedScale,
      widthRatio: (width * calculatedScale) / containerWidth,
      heightRatio: (height * calculatedScale) / containerHeight
    });
    console.log('Scale calculation:', { 
      pdfWidth: width, 
      pdfHeight: height, 
      containerWidth, 
      containerHeight, 
      scaleX, 
      scaleY, 
      calculatedScale,
      resultingWidth: width * calculatedScale,
      resultingHeight: height * calculatedScale
    });
    return calculatedScale;
  }, [extractedPageWidth, extractedPageHeight, pageWidth, pageHeight]);

  console.log('Rendering PdfTextEditorClean:', {
    hasPdfFile: !!pdfFile,
    currentPage,
    textElementsCount: textElements.length,
    isExtracting,
    pageWidth,
    pageHeight,
    scale
  });

  // Always show something, even if extraction hasn't completed
  if (!pdfFile) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-gray-500">No PDF file loaded</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: '#ffffff' }}>
      {/* Hidden PDF viewer to get text layer for style extraction */}
      {pdfFile && (
        <div 
          ref={pdfViewerRef}
          className="absolute opacity-0 pointer-events-none"
          style={{ zIndex: -1, visibility: 'hidden' }}
        >
          <Document
            file={pdfFile}
            loading={<div />}
          >
            <Page
              pageNumber={currentPage}
              scale={1.0}
              renderTextLayer={true}
              renderAnnotationLayer={false}
            />
          </Document>
        </div>
      )}
      
      {/* Clean text editor */}
      <div 
        ref={containerRef}
        className="pdf-text-editor relative w-full h-full bg-white border border-gray-300 overflow-auto"
        style={{
          minHeight: '600px',
          position: 'relative',
        }}
      >
      {/* Debug overlay - always visible */}
      <div className="absolute top-2 right-2 bg-black bg-opacity-75 text-white text-xs p-2 z-30 rounded font-mono">
        <div>Extracting: {isExtracting ? 'Yes' : 'No'}</div>
        <div>Text Elements: {textElements.length}</div>
        <div>Images: {imageElements.length}</div>
        <div>Background: {pageBackgroundImage ? 'Yes' : 'No'}</div>
        <div>Page: {actualPageWidth.toFixed(0)}x{actualPageHeight.toFixed(0)}</div>
        <div>Scale: {scale.toFixed(2)}</div>
        <div>Extracted: {extractedPageWidth ? 'Yes' : 'No'}</div>
      </div>

      {isExtracting && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50 z-20">
          <p className="text-gray-600">Extracting text...</p>
        </div>
      )}

          {!isExtracting && textElements.length > 0 && (
        <div
          className="relative"
          style={{
            width: `${actualPageWidth * scale}px`,
            height: `${actualPageHeight * scale}px`,
            margin: '0 auto',
            minHeight: '100px',
            backgroundColor: pageBackgroundImage ? 'transparent' : '#ffffff', // Only use white if no background image
            backgroundImage: pageBackgroundImage ? `url(${pageBackgroundImage})` : 'none',
            // CRITICAL: backgroundSize must match the container size exactly
            // The background image is rendered at actualPageWidth x actualPageHeight
            // So we scale it to match the scaled container
            backgroundSize: pageBackgroundImage ? `${actualPageWidth * scale}px ${actualPageHeight * scale}px` : 'auto',
            backgroundPosition: '0 0', // Top-left, no offset
            backgroundRepeat: 'no-repeat',
            border: 'none',
            // Ensure background covers entire area
            backgroundAttachment: 'local',
          }}
        >
          
          {/* Individual images (if any were extracted separately) */}
          {imageElements.map((image) => {
            return (
              <img
                key={image.id}
                src={image.src}
                alt="PDF image"
                style={{
                  position: 'absolute',
                  left: `${image.x * scale}px`,
                  top: `${image.y * scale}px`,
                  width: `${image.width * scale}px`,
                  height: `${image.height * scale}px`,
                  pointerEvents: 'none',
                  zIndex: 5,
                }}
              />
            );
          })}
          
          {/* Editable text elements - clean editor without PDF background */}
          {textElements.map((element, index) => {
            console.log(`Rendering element ${index}:`, {
              id: element.id,
              text: element.text.substring(0, 30),
              x: element.x,
              y: element.y,
              scaledX: element.x * scale,
              scaledY: element.y * scale,
              fontSize: element.fontSize,
              scaledFontSize: element.fontSize * scale
            });
            return (
              <EditableTextElement
                key={element.id}
                element={element}
                scale={scale}
                onTextChange={handleTextChange}
              />
            );
          })}
        </div>
      )}

      {!isExtracting && textElements.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-gray-500 mb-2">No text found in this page</p>
            <p className="text-gray-400 text-sm">Check console for extraction logs</p>
            <p className="text-gray-400 text-xs mt-2">Debug: isExtracting={String(isExtracting)}, textElements.length={textElements.length}</p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// Editable text element component
function EditableTextElement({
  element,
  scale,
  onTextChange,
}: {
  element: TextElement;
  scale: number;
  onTextChange: (id: string, text: string) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [value, setValue] = useState(element.text || '');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Update value when element changes
  useEffect(() => {
    const newValue = element.text || '';
    console.log(`EditableTextElement: Updating value for ${element.id}:`, {
      oldValue: value.substring(0, 30),
      newValue: newValue.substring(0, 30),
      newValueLength: newValue.length
    });
    setValue(newValue);
  }, [element.text, element.id]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onTextChange(element.id, newValue);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const isMultiline = element.height > element.fontSize * 1.5;

  // The font size extracted from DOM is the actual rendered size at the hidden viewer's scale (1.0)
  // Since we're scaling the entire page container, we need to scale the font size proportionally
  // Use the exact extracted font size scaled by the container scale
  const scaledFontSize = element.fontSize * scale;
  
  // Log font size calculation for debugging
  useEffect(() => {
    if (element.id.startsWith('text-0') || element.id.startsWith('text-1') || element.id.startsWith('text-2')) {
      console.log(`Font size for ${element.id}:`, {
        extractedFontSize: element.fontSize,
        scale: scale,
        scaledFontSize: scaledFontSize,
        fontFamily: element.fontFamily,
        fontWeight: element.fontWeight,
        elementHeight: element.height,
        elementWidth: element.width
      });
    }
  }, [element.id, element.fontSize, scale, scaledFontSize, element.fontFamily, element.fontWeight, element.height, element.width]);
  
  // Scale line height if it's a pixel value, otherwise use relative value
  // Line height should be proportional to font size
  const scaledLineHeight = element.lineHeight 
    ? (element.lineHeight.includes('px') 
        ? `${parseFloat(element.lineHeight) * scale}px` 
        : element.lineHeight.includes('em') || element.lineHeight.includes('%')
        ? element.lineHeight // Keep relative values as-is
        : `${parseFloat(element.lineHeight) * scale}px`)
    : `${scaledFontSize * 1.2}px`; // Default to 1.2x font size
  
  // Scale letter spacing if it's a pixel value
  const scaledLetterSpacing = element.letterSpacing 
    ? (element.letterSpacing.includes('px') 
        ? `${parseFloat(element.letterSpacing) * scale}px` 
        : element.letterSpacing)
    : 'normal';
  
  // Calculate text width more accurately using canvas measureText
  const calculateTextWidth = (text: string, fontSize: number, fontFamily: string, fontWeight: string, fontStyle: string): number => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return element.width * scale;
    
    const fontString = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    context.font = fontString;
    
    // For multi-line text, calculate width of the longest line
    const lines = text.split('\n');
    let maxWidth = 0;
    for (const line of lines) {
      const metrics = context.measureText(line || ' ');
      maxWidth = Math.max(maxWidth, metrics.width);
    }
    return maxWidth;
  };
  
  // Use calculated text width or extracted width, whichever is larger, with generous padding
  const textContent = value || element.text || element.originalText || '';
  const textWidth = calculateTextWidth(
    textContent,
    scaledFontSize,
    element.fontFamily || 'Arial, sans-serif',
    element.fontWeight || 'normal',
    element.fontStyle || 'normal'
  );
  const extractedWidth = element.width * scale;
  
  // Use the extracted width (from PDF) as the base, but ensure it's not too large
  // This ensures textareas don't overlap with other paragraphs on the same line
  // Add small padding (10px) for editing comfort, but don't exceed extracted width by much
  const finalWidth = Math.min(
    extractedWidth + 10, // Extracted width + small padding
    textWidth + 20, // Text width + small padding (whichever is smaller)
    extractedWidth * 1.1 // Max 10% larger than extracted width
  );
  
  // Ensure minimum width for editing
  const minWidth = Math.max(finalWidth, 50);
  
  const style = {
    position: 'absolute' as const,
    left: `${element.x * scale}px`,
    top: `${element.y * scale}px`, // Y is already converted to top-left origin
    width: `${minWidth}px`, // Use extracted width to prevent overlap with other paragraphs
    height: `${Math.max(element.height * scale + 5, scaledFontSize * 1.5)}px`, // Add extra height
    fontSize: `${scaledFontSize}px`,
    fontFamily: element.fontFamily || 'Arial, sans-serif',
    fontWeight: element.fontWeight || 'normal',
    fontStyle: element.fontStyle || 'normal',
    letterSpacing: scaledLetterSpacing,
    textDecoration: element.textDecoration || 'none',
    textTransform: element.textTransform || 'none',
    // Ensure color is not transparent - if alpha is 0, use black
    color: (() => {
      const color = element.color || '#000000';
      // Check if color is rgba with alpha 0 (transparent)
      if (color.includes('rgba') && color.includes(', 0)')) {
        return '#000000'; // Fallback to black if transparent
      }
      // Check if color is rgba with very low alpha
      const rgbaMatch = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      if (rgbaMatch && parseFloat(rgbaMatch[4]) < 0.1) {
        return '#000000'; // Fallback to black if nearly transparent
      }
      return color;
    })(),
    backgroundColor: isFocused 
      ? 'rgba(255, 255, 0, 0.3)' // Yellow highlight when focused
      : 'transparent', // Always transparent when not focused - background image shows through
    border: isFocused ? '2px solid #0066cc' : 'none', // Only show border when focused
    padding: '2px 4px', // Reduced padding to prevent truncation
    margin: 0,
    resize: 'none' as const,
    overflow: 'visible' as const, // Allow text to overflow if needed
    overflowX: 'visible' as const,
    overflowY: 'visible' as const,
    whiteSpace: (isMultiline ? 'pre-wrap' : 'pre') as const, // Preserve whitespace
    lineHeight: scaledLineHeight, // Use extracted line height or default
    verticalAlign: 'top' as const, // Align text to top
    minWidth: `${Math.max(element.width * scale, 50)}px`, // Minimum width for editing
    minHeight: `${Math.max(element.height * scale, scaledFontSize * 1.5)}px`, // Minimum height
    outline: 'none',
    boxSizing: 'content-box' as const, // Border and padding don't affect width/height
    cursor: 'text',
    scrollbarWidth: 'none' as const, // Firefox
    msOverflowStyle: 'none' as const, // IE and Edge
    zIndex: 10,
    display: 'block' as const,
  };

  // Ensure value is not empty - use element.text as fallback
  const displayValue = value || element.text || element.originalText || '';
  
  console.log(`EditableTextElement render:`, {
    id: element.id,
    elementText: element.text?.substring(0, 30) || 'EMPTY',
    elementTextLength: element.text?.length || 0,
    value: displayValue.substring(0, 30) || 'EMPTY',
    valueLength: displayValue.length,
    originalText: element.originalText?.substring(0, 30) || 'EMPTY',
    originalFontSize: element.fontSize,
    scale: scale,
    calculatedFontSize: scaledFontSize,
    style: {
      left: style.left,
      top: style.top,
      width: style.width,
      height: style.height,
      fontSize: style.fontSize,
      color: style.color,
      backgroundColor: style.backgroundColor,
    }
  });

  // If value is still empty, log a warning
  if (!displayValue || displayValue.trim().length === 0) {
    console.warn(`WARNING: Element ${element.id} has no text!`, {
      element,
      value,
      displayValue
    });
  }

  // Debug: Log if textarea will be visible
  useEffect(() => {
    if (inputRef.current) {
      const computedStyle = window.getComputedStyle(inputRef.current);
      console.log(`Textarea ${element.id} computed styles:`, {
        fontSize: computedStyle.fontSize,
        color: computedStyle.color,
        backgroundColor: computedStyle.backgroundColor,
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        opacity: computedStyle.opacity,
        width: computedStyle.width,
        height: computedStyle.height,
        value: inputRef.current.value.substring(0, 20),
      });
    }
  }, [element.id, displayValue]);

  return (
    <textarea
      ref={inputRef}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={style}
      placeholder={displayValue ? undefined : 'Empty text'}
      readOnly={false}
      spellCheck={false}
    />
  );
}

