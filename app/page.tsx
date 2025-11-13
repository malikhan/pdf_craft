'use client';

import { useState, useRef, useEffect } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import Toolbar from '@/components/Toolbar';
import EditorCanvas from '@/components/EditorCanvas';
import PdfTextEditor from '@/components/PdfTextEditor';
import PdfTextEditorClean from '@/components/PdfTextEditorClean';
import FileUpload from '@/components/FileUpload';
import Sidebar from '@/components/Sidebar';
import { loadPDF, createBlankPDF, savePDF, downloadPDF, applyFabricToPDF, clearAndRedrawPDFPage } from '@/lib/pdfUtils';
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
  const [editMode, setEditMode] = useState(false);
  const [editedTexts, setEditedTexts] = useState<Array<{ 
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
  }>>([]);
  const [pdfPageDimensions, setPdfPageDimensions] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    try {
      const doc = await loadPDF(file);
      setPdfFile(file);
      setPdfDoc(doc);
      setNumPages(doc.getPageCount());
      setCurrentPage(1);
      setCurrentTool('select');
      setEditMode(false); // Reset edit mode when new PDF is loaded
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
    if (!pdfDoc || !pdfFile) {
      alert('No PDF loaded');
      return;
    }

    try {
      if (editMode && editedTexts.length > 0) {
        // Use server-side cover+redraw approach
        // Convert PDF to base64 (handle large files)
        const pdfBytes = await pdfDoc.save();
        // Convert Uint8Array to base64 safely (browser-compatible)
        const uint8Array = new Uint8Array(pdfBytes);
        let binary = '';
        const len = uint8Array.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binary);
        
        // Send to server for editing
        const response = await fetch('/api/edit-pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pdfData: base64,
            pageNumber: currentPage,
            editedTexts: editedTexts,
            pdfPageDimensions: pdfPageDimensions,
            filename: 'edited.pdf',
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to edit PDF');
        }

        const result = await response.json();
        
        // Download the edited PDF
        const binaryString = atob(result.pdfData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        downloadPDF(blob, result.filename || 'edited.pdf');
        
        // Reload the edited PDF
        const newDoc = await PDFDocument.load(bytes);
        setPdfDoc(newDoc);
        const fileBlob = new Blob([bytes], { type: 'application/pdf' });
        const arrayBuffer = await fileBlob.arrayBuffer();
        setPdfFile(arrayBuffer);
      } else if (canvasInstance) {
        // Save canvas content (for non-edit mode) - keep existing client-side approach
        await clearAndRedrawPDFPage(pdfDoc, currentPage - 1, canvasInstance);
        const blob = await savePDF(pdfDoc);
        downloadPDF(blob, 'edited.pdf');
      } else {
        // Just save the PDF as-is
        const blob = await savePDF(pdfDoc);
        downloadPDF(blob, 'edited.pdf');
      }
    } catch (error) {
      console.error('Error saving PDF:', error);
      alert(`Failed to save PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const applyEditedTextsToPDF = async (
    pdfDoc: PDFDocument,
    pageIndex: number,
    texts: Array<{ text: string; x: number; y: number; fontSize: number; fontFamily: string }>
  ) => {
    const pages = pdfDoc.getPages();
    const page = pages[pageIndex];
    const { width, height } = page.getSize();

    // Get PDF page dimensions from react-pdf
    const pdfPage = document.querySelector('.react-pdf__Page');
    if (!pdfPage) {
      throw new Error('PDF page not found');
    }
    const pdfPageRect = pdfPage.getBoundingClientRect();
    const scaleX = width / pdfPageRect.width;
    const scaleY = height / pdfPageRect.height;

    // Clear the page
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(1, 1, 1), // White background
    });

    // Draw edited texts
    for (const textItem of texts) {
      if (!textItem.text.trim()) continue;

      // Convert from screen coordinates to PDF coordinates
      // PDF uses bottom-left origin, screen uses top-left
      const pdfX = textItem.x * scaleX;
      const pdfY = height - (textItem.y * scaleY) - (textItem.fontSize * scaleY);

      try {
        page.drawText(textItem.text, {
          x: pdfX,
          y: pdfY,
          size: textItem.fontSize * scaleY,
          font: await pdfDoc.embedFont('Helvetica'), // Default font
          color: rgb(0, 0, 0),
        });
      } catch (error) {
        console.warn('Error drawing text:', error);
      }
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

  const canvasReadyRef = useRef<fabric.Canvas | null>(null);
  
  const handleCanvasReady = (canvas: fabric.Canvas) => {
    canvasReadyRef.current = canvas;
    setCanvasInstance(canvas);
  };

  const loadPDFContent = async (canvas?: fabric.Canvas, preExtractedDomPositions?: Array<{ text: string; x: number; y: number; width: number; height: number; fontSize: number; fontFamily: string }>, pdfPagePosition?: { left: number; top: number; width: number; height: number } | null) => {
    // Use provided canvas, or fall back to canvasInstance or ref
    const canvasToUse = canvas || canvasInstance || canvasReadyRef.current;
    
    if (!pdfFile || !canvasToUse) {
      console.error('Missing pdfFile or canvasInstance:', { 
        pdfFile: !!pdfFile, 
        canvasInstance: !!canvasInstance,
        canvasReadyRef: !!canvasReadyRef.current,
        providedCanvas: !!canvas
      });
      return;
    }
    
    try {
      console.log('Loading PDF content for page', currentPage);
      
      // Clear canvas first - but check if context is available
      try {
        const lowerCanvasEl = canvasToUse.lowerCanvasEl;
        if (lowerCanvasEl && lowerCanvasEl.getContext('2d')) {
          canvasToUse.clear();
        } else {
          console.warn('Canvas context not ready, skipping clear');
        }
      } catch (clearError) {
        console.warn('Error clearing canvas:', clearError);
        // Continue anyway - canvas might be in a transitional state
      }
      
      // NEW APPROACH: Convert PDF page to image, use as background, overlay editable text
      const pdfjsLib = await import('pdfjs-dist');
      let arrayBuffer: ArrayBuffer;
      if (pdfFile instanceof File) {
        arrayBuffer = await pdfFile.arrayBuffer();
      } else {
        arrayBuffer = pdfFile;
      }
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(currentPage);
      
      // Use the same scale as PDF viewer (1.5) for consistency
      const scale = 1.5;
      const viewport = page.getViewport({ scale: scale });
      
      console.log('PDF page loaded, viewport:', { 
        width: viewport.width, 
        height: viewport.height, 
        scale
      });
      
      // Render PDF page to canvas to get image
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas context');
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      
      await page.render(renderContext).promise;
      console.log('PDF page rendered to canvas');
      
      // Convert canvas to image URL
      const pdfImageUrl = canvas.toDataURL('image/png');
      console.log('PDF image URL created, length:', pdfImageUrl.length);
      
      // Set PDF image as canvas background
      const { fabric } = await import('fabric');
      
      // Verify canvas is still valid before using it
      if (!canvasToUse || !canvasToUse.lowerCanvasEl) {
        console.error('Canvas is not valid or has been disposed');
        throw new Error('Canvas is not ready');
      }
      
      // Set canvas dimensions first - must match PDF page exactly
      // Use the PDF page's actual rendered dimensions, not viewport dimensions
      // This ensures the canvas coordinate system matches the DOM positions
      try {
        const canvasElement = canvasToUse.getElement();
        const lowerCanvasEl = canvasToUse.lowerCanvasEl;
        const upperCanvasEl = canvasToUse.upperCanvasEl;
        
        // Use PDF page dimensions if available, otherwise use viewport
        let canvasWidth = viewport.width;
        let canvasHeight = viewport.height;
        
        if (pdfPagePosition) {
          // Use the actual rendered PDF page dimensions
          canvasWidth = pdfPagePosition.width;
          canvasHeight = pdfPagePosition.height;
          console.log('Using PDF page dimensions for canvas:', { 
            width: canvasWidth, 
            height: canvasHeight,
            viewport: { width: viewport.width, height: viewport.height }
          });
        }
        
        // Set dimensions using Fabric.js methods
        canvasToUse.setWidth(canvasWidth);
        canvasToUse.setHeight(canvasHeight);
        
        // Also set the actual canvas element width/height attributes directly
        // This ensures the internal canvas dimensions match
        if (canvasElement) {
          canvasElement.width = canvasWidth;
          canvasElement.height = canvasHeight;
        }
        if (lowerCanvasEl) {
          lowerCanvasEl.width = canvasWidth;
          lowerCanvasEl.height = canvasHeight;
        }
        if (upperCanvasEl) {
          upperCanvasEl.width = canvasWidth;
          upperCanvasEl.height = canvasHeight;
        }
        
        // Position canvas to match PDF page if position is provided
        if (pdfPagePosition && canvasElement) {
          // Find the canvas container (the div that wraps the canvas)
          // The canvas is inside a div with ref={containerRef} in EditorCanvas
          let container = canvasElement.parentElement;
          // Look for the containerRef div - it should be the parent that has the relative positioning
          while (container && container !== document.body) {
            const computedStyle = window.getComputedStyle(container);
            if (computedStyle.position === 'relative' || container.hasAttribute('data-canvas-container')) {
              break;
            }
            container = container.parentElement;
          }
          
          // Fallback to the immediate parent if we didn't find a relative container
          if (!container || container === document.body) {
            container = canvasElement.parentElement;
          }
          
          if (container) {
            const containerRect = container.getBoundingClientRect();
            // Calculate position relative to container
            const relativeLeft = pdfPagePosition.left - containerRect.left;
            const relativeTop = pdfPagePosition.top - containerRect.top;
            
            console.log('Positioning canvas:', {
              pdfPagePos: { left: pdfPagePosition.left.toFixed(1), top: pdfPagePosition.top.toFixed(1) },
              containerPos: { left: containerRect.left.toFixed(1), top: containerRect.top.toFixed(1) },
              calculatedPos: { left: relativeLeft.toFixed(1), top: relativeTop.toFixed(1) }
            });
            
            // Set canvas position to match PDF page
            // Position the canvas element itself
            canvasElement.style.position = 'absolute';
            canvasElement.style.left = `${relativeLeft}px`;
            canvasElement.style.top = `${relativeTop}px`;
            canvasElement.style.margin = '0';
            
            // Also position the upper canvas if it exists
            if (upperCanvasEl) {
              upperCanvasEl.style.position = 'absolute';
              upperCanvasEl.style.left = `${relativeLeft}px`;
              upperCanvasEl.style.top = `${relativeTop}px`;
              upperCanvasEl.style.margin = '0';
            }
            
            // Force style application with !important to override any React styles
            canvasElement.setAttribute('style', 
              `${canvasElement.getAttribute('style') || ''}; position: absolute !important; left: ${relativeLeft}px !important; top: ${relativeTop}px !important; margin: 0 !important;`
            );
            
            if (upperCanvasEl) {
              upperCanvasEl.setAttribute('style', 
                `${upperCanvasEl.getAttribute('style') || ''}; position: absolute !important; left: ${relativeLeft}px !important; top: ${relativeTop}px !important; margin: 0 !important;`
              );
            }
            
            console.log('Canvas positioned to match PDF page:', {
              pdfPagePos: pdfPagePosition,
              containerRect: { left: containerRect.left, top: containerRect.top, width: containerRect.width, height: containerRect.height },
              canvasPos: { left: relativeLeft.toFixed(1), top: relativeTop.toFixed(1) },
              canvasElementStyle: {
                position: canvasElement.style.position,
                left: canvasElement.style.left,
                top: canvasElement.style.top
              }
            });
            
            // Verify positioning after a short delay
            setTimeout(() => {
              const actualRect = canvasElement.getBoundingClientRect();
              const diffLeft = actualRect.left - pdfPagePosition.left;
              const diffTop = actualRect.top - pdfPagePosition.top;
              console.log('Canvas actual position after positioning:', {
                expected: { left: pdfPagePosition.left.toFixed(1), top: pdfPagePosition.top.toFixed(1) },
                actual: { left: actualRect.left.toFixed(1), top: actualRect.top.toFixed(1) },
                diff: { 
                  left: diffLeft.toFixed(1), 
                  top: diffTop.toFixed(1) 
                },
                isAligned: Math.abs(diffLeft) < 2 && Math.abs(diffTop) < 2
              });
              
              if (Math.abs(diffLeft) > 2 || Math.abs(diffTop) > 2) {
                console.warn('Canvas is NOT aligned with PDF page! Adjusting...');
                // Calculate the correct position directly from PDF page position
                const container = canvasElement.parentElement;
                let containerToUse = container;
                while (containerToUse && !containerToUse.hasAttribute('data-canvas-container') && containerToUse !== document.body) {
                  containerToUse = containerToUse.parentElement;
                }
                
                if (containerToUse) {
                  const containerRect = containerToUse.getBoundingClientRect();
                  const correctLeft = pdfPagePosition.left - containerRect.left;
                  const correctTop = pdfPagePosition.top - containerRect.top;
                  
                  canvasElement.style.left = `${correctLeft}px`;
                  canvasElement.style.top = `${correctTop}px`;
                  if (upperCanvasEl) {
                    upperCanvasEl.style.left = `${correctLeft}px`;
                    upperCanvasEl.style.top = `${correctTop}px`;
                  }
                  
                  // Also adjust all text objects if they've already been added
                  const objects = canvasToUse.getObjects();
                  if (objects.length > 0) {
                    console.log(`Adjusting ${objects.length} text objects by offset:`, { 
                      left: -diffLeft.toFixed(1), 
                      top: -diffTop.toFixed(1) 
                    });
                    objects.forEach((obj: any) => {
                      if (obj.type === 'textbox' || obj.type === 'text') {
                        obj.set({
                          left: (obj.left || 0) - diffLeft,
                          top: (obj.top || 0) - diffTop
                        });
                      }
                    });
                    canvasToUse.renderAll();
                  }
                  
                  console.log('Adjusted canvas position to:', { left: correctLeft.toFixed(1), top: correctTop.toFixed(1) });
                }
              }
            }, 200);
          } else {
            console.warn('Could not find canvas container for positioning');
          }
        }
        
        // Recalculate offsets after dimension change
        canvasToUse.calcOffset();
        
        // Reset canvas offset to (0, 0) since we're positioning the canvas element itself
        // The offset should be zero because we're using absolute positioning
        if (canvasToUse._offset) {
          canvasToUse._offset.left = 0;
          canvasToUse._offset.top = 0;
        }
        
        canvasToUse.renderAll();
        
        console.log('Canvas dimensions set:', { 
          viewport: { width: viewport.width, height: viewport.height },
          canvasElement: { width: canvasElement?.width, height: canvasElement?.height },
          lowerCanvas: { width: lowerCanvasEl?.width, height: lowerCanvasEl?.height },
          fabricCanvas: { width: canvasToUse.width, height: canvasToUse.height }
        });
        
        // Verify dimensions match
        const widthMatch = Math.abs((canvasElement?.width || 0) - viewport.width) <= 1;
        const heightMatch = Math.abs((canvasElement?.height || 0) - viewport.height) <= 1;
        
        if (!widthMatch || !heightMatch) {
          console.warn('Canvas dimensions mismatch!', {
            expected: { width: viewport.width, height: viewport.height },
            actual: { 
              element: { width: canvasElement?.width, height: canvasElement?.height },
              lower: { width: lowerCanvasEl?.width, height: lowerCanvasEl?.height },
              fabric: { width: canvasToUse.width, height: canvasToUse.height }
            }
          });
        }
      } catch (error) {
        console.error('Error setting canvas dimensions:', error);
        throw new Error('Failed to set canvas dimensions');
      }
      
      // Wait for background image to load before adding text
      await new Promise<void>((resolve, reject) => {
        fabric.Image.fromURL(pdfImageUrl, (img) => {
          if (!img) {
            reject(new Error('Failed to load PDF image'));
            return;
          }
          
          // Get actual canvas dimensions
          const actualCanvasWidth = pdfPagePosition?.width || viewport.width;
          const actualCanvasHeight = pdfPagePosition?.height || viewport.height;
          
          // Scale the image to match canvas dimensions
          // The image was rendered at viewport dimensions, but canvas might be at PDF page dimensions
          const scaleX = actualCanvasWidth / viewport.width;
          const scaleY = actualCanvasHeight / viewport.height;
          
          img.set({
            left: 0,
            top: 0,
            selectable: false,
            evented: false,
            excludeFromExport: false,
          });
          
          canvasToUse.setBackgroundImage(img, () => {
            console.log('Background image set', {
              imageSize: { width: img.width, height: img.height },
              canvasSize: { width: actualCanvasWidth, height: actualCanvasHeight },
              scale: { x: scaleX.toFixed(3), y: scaleY.toFixed(3) }
            });
            canvasToUse.renderAll();
            resolve();
          }, {
            scaleX: scaleX,
            scaleY: scaleY,
          });
        }, {
          crossOrigin: 'anonymous',
        });
      });
      
      // Extract text content
      const textContent = await page.getTextContent({ normalizeWhitespace: false });
      console.log('Text content extracted, items:', textContent.items.length);
      
      // Use pre-extracted DOM positions if available (extracted before hiding PDF viewer)
      // Otherwise try to extract now (but PDF might be hidden, so positions might be wrong)
      let domTextPositions: Array<{ text: string; x: number; y: number; width: number; height: number; fontSize: number; fontFamily: string }> = preExtractedDomPositions || [];
      
      // If we don't have pre-extracted positions, try to get them now
      if (domTextPositions.length === 0) {
        try {
          // Wait for text layer to render (PDF viewer should still be in DOM, just hidden)
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const textLayer = document.querySelector('.react-pdf__Page__textContent');
          const pdfPage = document.querySelector('.react-pdf__Page');
          
          if (textLayer && pdfPage) {
            const spans = textLayer.querySelectorAll('span');
            console.log('Found', spans.length, 'text spans in DOM (fallback extraction)');
            
            const pdfPageRect = pdfPage.getBoundingClientRect();
            
            spans.forEach((span) => {
              const rect = span.getBoundingClientRect();
              const text = span.textContent || '';
              
              if (text.trim()) {
                // Get position relative to PDF page (which matches our canvas)
                const x = rect.left - pdfPageRect.left;
                const y = rect.top - pdfPageRect.top;
                const computedStyle = window.getComputedStyle(span);
                const fontSize = parseFloat(computedStyle.fontSize) || 12;
                const fontFamily = computedStyle.fontFamily || 'Arial';
                
                domTextPositions.push({
                  text: text.trim(),
                  x,
                  y,
                  width: rect.width,
                  height: rect.height,
                  fontSize,
                  fontFamily: fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
                });
              }
            });
            
            console.log('Extracted', domTextPositions.length, 'DOM text positions (fallback)');
          } else {
            console.warn('Text layer or PDF page not found in DOM');
          }
        } catch (error) {
          console.warn('Could not extract DOM positions, using PDF coordinates:', error);
        }
      } else {
        console.log('Using pre-extracted DOM positions:', domTextPositions.length);
      }
      
      // Process text items and create editable text objects
      const textObjects: any[] = [];
      
      for (const item of textContent.items) {
        if ('str' in item && item.str && String(item.str).trim()) {
          const transform = item.transform || [12, 0, 0, 12, 0, 0];
          const text = String(item.str).trim();
          
          // Get font info from transform matrix
          const fontSize = Math.abs(transform[3]) || Math.abs(transform[0]) || 12;
          const scaledFontSize = fontSize * scale;
          
          let fontFamily = 'Arial';
          if ('fontName' in item && item.fontName) {
            const fontName = String(item.fontName);
            fontFamily = fontName.split('-')[0].split('+')[1] || fontName.split('-')[0] || 'Arial';
            fontFamily = fontFamily.replace(/^[A-Z0-9]+/, '').trim() || 'Arial';
          }
          
          // Try to use DOM position if available, otherwise use PDF coordinates
          let canvasX: number;
          let canvasY: number;
          let finalFontSize = scaledFontSize;
          let finalFontFamily = fontFamily;
          
          // Try to find matching DOM position by text content
          // Match by checking if text overlaps or is similar
          const matchingDomPos = domTextPositions.find(pos => {
            const posText = pos.text.toLowerCase().trim();
            const itemText = text.toLowerCase().trim();
            // Check if texts match or overlap
            return posText.includes(itemText.substring(0, Math.min(10, itemText.length))) || 
                   itemText.includes(posText.substring(0, Math.min(10, posText.length))) ||
                   posText === itemText;
          });
          
          if (matchingDomPos) {
            // Use DOM position - this is the exact position from react-pdf
            // These positions are relative to the PDF page element's bounding rect
            // Since the canvas is positioned to match the PDF page exactly,
            // we can use these positions directly on the canvas
            canvasX = matchingDomPos.x;
            canvasY = matchingDomPos.y;
            finalFontSize = matchingDomPos.fontSize;
            finalFontFamily = matchingDomPos.fontFamily;
            
            if (textObjects.length < 5) {
              console.log('Using DOM position for:', text.substring(0, 20), { 
                x: canvasX.toFixed(1), 
                y: canvasY.toFixed(1),
                fontSize: finalFontSize,
                matchedText: matchingDomPos.text.substring(0, 20),
                viewport: { width: viewport.width, height: viewport.height },
                pdfPageWidth: pdfPagePosition?.width,
                pdfPageHeight: pdfPagePosition?.height
              });
            }
            
            // Remove from array to avoid duplicate matches
            const index = domTextPositions.indexOf(matchingDomPos);
            if (index > -1) {
              domTextPositions.splice(index, 1);
            }
          } else {
            // Fallback to PDF coordinates
            const pdfX = transform[4] || 0;
            const pdfY = transform[5] || 0;
            const scaledPdfX = pdfX * scale;
            const scaledPdfY = pdfY * scale;
            const fontHeight = Math.abs(transform[3]) || fontSize;
            const scaledFontHeight = fontHeight * scale;
            
            // Convert Y coordinate - try different offset values
            // transform[5] is baseline from bottom, we need top position
            const baselineOffset = 0.8; // Adjust: 0.7-0.9
            canvasY = viewport.height - scaledPdfY - (scaledFontHeight * baselineOffset);
            canvasX = scaledPdfX;
            
            if (textObjects.length < 3) {
              console.log('Using PDF coordinates for:', text.substring(0, 20), {
                pdfX: pdfX.toFixed(1),
                pdfY: pdfY.toFixed(1),
                canvasX: canvasX.toFixed(1),
                canvasY: canvasY.toFixed(1),
              });
            }
          }
          
          // Get canvas dimensions (might be different from viewport if using PDF page dimensions)
          const actualCanvasWidth = pdfPagePosition?.width || viewport.width;
          const actualCanvasHeight = pdfPagePosition?.height || viewport.height;
          
          // If using DOM positions, they're already in the correct coordinate system
          // If using PDF coordinates, we need to scale them to match canvas dimensions
          let finalX = canvasX;
          let finalY = canvasY;
          
          if (!matchingDomPos) {
            // PDF coordinates need to be scaled to match canvas dimensions
            // The viewport is at scale 1.5, but canvas might be at PDF page's actual size
            const scaleX = actualCanvasWidth / viewport.width;
            const scaleY = actualCanvasHeight / viewport.height;
            finalX = canvasX * scaleX;
            finalY = canvasY * scaleY;
          }
          
          const textObj = new fabric.Textbox(text, {
            left: finalX,
            top: finalY,
            width: Math.max(text.length * finalFontSize * 0.5, 50),
            fontSize: finalFontSize,
            fontFamily: finalFontFamily,
            fill: '#000000',
            opacity: 1,
            selectable: true,
            editable: true,
            originX: 'left',
            originY: 'top',
            lineHeight: 1.0,
          });
          
          // Store the original position for verification
          (textObj as any)._originalPosition = { x: finalX, y: finalY };
          
          // Debug first few text objects
          if (textObjects.length < 3) {
            console.log('Created text object:', {
              text: text.substring(0, 20),
              position: { left: finalX.toFixed(1), top: finalY.toFixed(1) },
              fontSize: finalFontSize,
              canvasWidth: actualCanvasWidth,
              canvasHeight: actualCanvasHeight,
              usedDomPos: !!matchingDomPos
            });
          }
          
          textObjects.push(textObj);
        }
      }
      
      console.log('Created', textObjects.length, 'text objects');
      
      // Store original positions map before grouping (for verification)
      const originalPositionsMap = new Map<string, { x: number; y: number }>();
      textObjects.forEach((obj, idx) => {
        const key = `${obj.text || ''}_${idx}`;
        originalPositionsMap.set(key, { x: obj.left || 0, y: obj.top || 0 });
      });
      
      // Group into paragraphs
      const paragraphs: typeof textObjects[][] = [];
      const used = new Set<number>();
      
      for (let i = 0; i < textObjects.length; i++) {
        if (used.has(i)) continue;
        
        const current = textObjects[i];
        const paragraph = [current];
        used.add(i);
        
        for (let j = i + 1; j < textObjects.length; j++) {
          if (used.has(j)) continue;
          
          const other = textObjects[j];
          const yDiff = Math.abs((current.top || 0) - (other.top || 0));
          const fontSizeDiff = Math.abs((current.fontSize || 12) - (other.fontSize || 12));
          
          if (yDiff < 20 && fontSizeDiff < 2) {
            const xDiff = Math.abs((current.left || 0) - (other.left || 0));
            if (yDiff < 5 || (yDiff < 20 && xDiff < 100)) {
              paragraph.push(other);
              used.add(j);
            }
          }
        }
        
        if (paragraph.length > 1) {
          // Combine into single textbox
          const texts = paragraph.map(p => p.text || '').join(' ');
          const first = paragraph[0];
          const minX = Math.min(...paragraph.map(p => p.left || 0));
          const maxX = Math.max(...paragraph.map(p => (p.left || 0) + (p.width || 0)));
          const minY = Math.min(...paragraph.map(p => p.top || 0));
          
          const combinedText = new fabric.Textbox(texts, {
            left: minX,
            top: minY,
            width: Math.max(maxX - minX, 100),
            fontSize: first.fontSize || 12,
            fontFamily: first.fontFamily || 'Arial',
            fill: '#000000',
            opacity: 1,
            selectable: true,
            editable: true,
            originX: 'left',
            originY: 'top',
          });
          
          // Store original position for verification
          (combinedText as any)._originalPosition = { x: minX, y: minY };
          (combinedText as any)._originalText = texts;
          
          canvasToUse.add(combinedText);
        } else {
          // Store original position for verification
          (paragraph[0] as any)._originalPosition = { x: paragraph[0].left || 0, y: paragraph[0].top || 0 };
          (paragraph[0] as any)._originalText = paragraph[0].text || '';
          canvasToUse.add(paragraph[0]);
        }
      }
      
      canvasToUse.renderAll();
      console.log(`Loaded ${textObjects.length} text objects as editable text for page ${currentPage}`);
      
      // Verify and correct text positioning after rendering
      // Use a longer delay to ensure everything is rendered
      setTimeout(() => {
        console.log('Starting text verification:', {
          hasPdfPagePosition: !!pdfPagePosition,
          hasDomPositions: !!preExtractedDomPositions,
          domPositionsCount: preExtractedDomPositions?.length || 0
        });
        
        const objects = canvasToUse.getObjects();
        console.log(`Found ${objects.length} objects on canvas`);
        
        if (!pdfPagePosition) {
          console.warn('No PDF page position available for verification');
          return;
        }
        
        const canvasElement = canvasToUse.getElement();
        const canvasRect = canvasElement.getBoundingClientRect();
        
        // Recalculate offset to ensure it's correct
        canvasToUse.calcOffset();
        const canvasOffset = canvasToUse._offset || { left: 0, top: 0 };
        
        console.log('Canvas info:', {
          canvasScreenPos: { left: canvasRect.left.toFixed(1), top: canvasRect.top.toFixed(1) },
          pdfPagePos: { left: pdfPagePosition.left.toFixed(1), top: pdfPagePosition.top.toFixed(1) },
          canvasOffset: { left: canvasOffset.left.toFixed(1), top: canvasOffset.top.toFixed(1) },
          canvasSize: { width: canvasToUse.width, height: canvasToUse.height }
        });
        
        // Calculate average offset from first few objects to apply to all
        let totalDiffX = 0;
        let totalDiffY = 0;
        let sampleCount = 0;
        const firstFewObjects = objects.slice(0, Math.min(10, objects.length));
        
        firstFewObjects.forEach((obj: any, index) => {
          if (obj.type === 'textbox' || obj.type === 'text') {
            const objText = (obj.text || '').trim();
            
            // Get the original position stored on the object
            const originalPos = (obj as any)._originalPosition;
            
            if (!originalPos) {
              console.warn(`Text object ${index} has no stored original position`);
              return;
            }
            
            // Calculate where text currently appears on screen
            // Fabric.js coordinates are relative to canvas, so we need canvas position + object position
            const currentCanvasX = (obj.left || 0);
            const currentCanvasY = (obj.top || 0);
            
            // Calculate expected position on canvas (relative to canvas, not screen)
            // The originalPos is relative to PDF page, but we need it relative to canvas
            // Since canvas is positioned to match PDF page, originalPos should work directly
            const expectedCanvasX = originalPos.x;
            const expectedCanvasY = originalPos.y;
            
            // Calculate the difference in canvas coordinates
            const diffX = currentCanvasX - expectedCanvasX;
            const diffY = currentCanvasY - expectedCanvasY;
            
            totalDiffX += diffX;
            totalDiffY += diffY;
            sampleCount++;
            
            console.log(`Text object ${index} verification:`, {
              text: objText.substring(0, 30),
              currentCanvasPos: { x: currentCanvasX.toFixed(1), y: currentCanvasY.toFixed(1) },
              expectedCanvasPos: { x: expectedCanvasX.toFixed(1), y: expectedCanvasY.toFixed(1) },
              diff: { x: diffX.toFixed(1), y: diffY.toFixed(1) }
            });
          }
        });
        
        // Calculate average offset and apply to all text objects
        if (sampleCount > 0) {
          const avgDiffX = totalDiffX / sampleCount;
          const avgDiffY = totalDiffY / sampleCount;
          
          console.log(`Calculated average offset:`, { 
            avgDiffX: avgDiffX.toFixed(2), 
            avgDiffY: avgDiffY.toFixed(2),
            sampleCount 
          });
          
          if (Math.abs(avgDiffX) > 0.5 || Math.abs(avgDiffY) > 0.5) {
            console.log(`Applying correction to all ${objects.length} text objects:`, { 
              adjustX: -avgDiffX.toFixed(2), 
              adjustY: -avgDiffY.toFixed(2),
              sampleCount 
            });
            
            objects.forEach((obj: any) => {
              if (obj.type === 'textbox' || obj.type === 'text') {
                const newLeft = (obj.left || 0) - avgDiffX;
                const newTop = (obj.top || 0) - avgDiffY;
                obj.set({
                  left: newLeft,
                  top: newTop
                });
              }
            });
            
            canvasToUse.renderAll();
            console.log('Text objects corrected and re-rendered');
            
            // Verify again after correction
            setTimeout(() => {
              const verifyObj = objects[0] as any;
              if (verifyObj && verifyObj.type === 'textbox') {
                const originalPos = verifyObj._originalPosition;
                if (originalPos) {
                  const finalDiffX = (verifyObj.left || 0) - originalPos.x;
                  const finalDiffY = (verifyObj.top || 0) - originalPos.y;
                  console.log('Post-correction verification:', {
                    finalDiff: { x: finalDiffX.toFixed(2), y: finalDiffY.toFixed(2) },
                    isAligned: Math.abs(finalDiffX) < 1 && Math.abs(finalDiffY) < 1
                  });
                }
              }
            }, 100);
          } else {
            console.log('Text objects are aligned correctly (offset < 0.5px)');
          }
        } else {
          console.warn('No text objects could be verified - cannot apply correction');
        }
      }, 500);
      
      // Update canvasInstance state if we used a different canvas
      if (canvasToUse !== canvasInstance) {
        setCanvasInstance(canvasToUse);
      }
      
      return;
    } catch (error) {
      console.error('Error loading PDF content:', error);
      throw error;
    }
  };

  const handleEditMode = () => {
    if (!pdfFile) {
      alert('Please upload a PDF first');
      return;
    }
    setEditMode(!editMode);
    if (!editMode) {
      // Clear edited texts when entering edit mode
      setEditedTexts([]);
    }
  };

  const handleTextChange = (texts: Array<{ 
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
  }>) => {
    setEditedTexts(texts);
  };
  
  // Get PDF page dimensions for coordinate conversion
  useEffect(() => {
    if (editMode && pdfFile) {
      const pdfPage = document.querySelector('.react-pdf__Page');
      if (pdfPage) {
        const rect = pdfPage.getBoundingClientRect();
        setPdfPageDimensions({ width: rect.width, height: rect.height });
      }
    }
  }, [editMode, pdfFile, currentPage]);

  // Reload content when page changes in edit mode
  useEffect(() => {
    if (editMode && pdfFile && canvasInstance) {
      loadPDFContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

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
        onEditMode={handleEditMode}
        canUndo={canUndo}
        canRedo={canRedo}
        hasPdf={hasPdf}
        editMode={editMode}
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
              {editMode ? (
                <PdfTextEditorClean
                  pdfFile={pdfFile}
                  currentPage={currentPage}
                  onTextChange={(elements) => {
                    // Convert to the format expected by handleTextChange
                    const formattedTexts = elements.map(el => ({
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
                    }));
                    setEditedTexts(formattedTexts);
                    setPdfPageDimensions({ width: elements[0]?.pageWidth || 612, height: elements[0]?.pageHeight || 792 });
                  }}
                  pageWidth={pdfPageDimensions?.width || 612}
                  pageHeight={pdfPageDimensions?.height || 792}
                />
              ) : (
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
                  editMode={false}
                />
              )}
              
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

