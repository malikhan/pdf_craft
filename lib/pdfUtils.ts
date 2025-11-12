import { PDFDocument, PDFPage, rgb, PDFImage } from 'pdf-lib';
import { fabric } from 'fabric';

export interface PDFPageData {
  pageNumber: number;
  pdfPage: PDFPage;
  fabricCanvas?: fabric.Canvas;
}

/**
 * Load a PDF file from a File object or ArrayBuffer
 */
export async function loadPDF(file: File | ArrayBuffer): Promise<PDFDocument> {
  let arrayBuffer: ArrayBuffer;
  
  if (file instanceof File) {
    arrayBuffer = await file.arrayBuffer();
  } else {
    arrayBuffer = file;
  }
  
  return await PDFDocument.load(arrayBuffer);
}

/**
 * Create a blank PDF document
 */
export async function createBlankPDF(width: number = 612, height: number = 792): Promise<PDFDocument> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([width, height]);
  return pdfDoc;
}

/**
 * Get PDF page as image data URL for rendering
 */
export async function getPDFPageAsImage(
  pdfDoc: PDFDocument,
  pageIndex: number,
  scale: number = 2
): Promise<string> {
  const pages = pdfDoc.getPages();
  const page = pages[pageIndex];
  const { width, height } = page.getSize();
  
  // For now, return a placeholder. In production, you'd use pdfjs-dist to render
  // This is a simplified version - react-pdf will handle the actual rendering
  return '';
}

/**
 * Apply fabric.js canvas changes to PDF page
 */
export async function applyFabricToPDF(
  pdfDoc: PDFDocument,
  pageIndex: number,
  fabricCanvas: fabric.Canvas
): Promise<void> {
  const pages = pdfDoc.getPages();
  const page = pages[pageIndex];
  
  const objects = fabricCanvas.getObjects();
  
  for (const obj of objects) {
    if (obj.type === 'textbox' || obj.type === 'text') {
      const textObj = obj as fabric.Textbox;
      // Convert canvas coordinates (top-left origin) to PDF coordinates (bottom-left origin)
      // Canvas is at scale 2.0 (from image rendering), PDF is at scale 1.0
      const pageHeight = page.getSize().height;
      const canvasScale = 2.0;
      const pdfX = (obj.left || 0) / canvasScale;
      // For Y: canvas uses top-left origin, PDF uses bottom-left origin
      const canvasY = (obj.top || 0) / canvasScale;
      const textHeight = (textObj.fontSize || 12) / canvasScale;
      const pdfY = pageHeight - canvasY - textHeight;
      const pdfFontSize = (textObj.fontSize || 12) / canvasScale;
      
      page.drawText(textObj.text || '', {
        x: pdfX,
        y: pdfY,
        size: pdfFontSize,
        color: rgb(0, 0, 0),
      });
    } else if (obj.type === 'rect') {
      const rect = obj as fabric.Rect;
      const fill = rect.fill as string;
      const stroke = rect.stroke as string;
      
      if (fill && fill !== 'transparent') {
        const color = hexToRgb(fill);
        page.drawRectangle({
          x: rect.left || 0,
          y: (page.getSize().height - (rect.top || 0)) - (rect.height || 0),
          width: rect.width || 0,
          height: rect.height || 0,
          color: rgb(color.r / 255, color.g / 255, color.b / 255),
        });
      }
      
      if (stroke && stroke !== 'transparent') {
        const color = hexToRgb(stroke);
        page.drawRectangle({
          x: rect.left || 0,
          y: (page.getSize().height - (rect.top || 0)) - (rect.height || 0),
          width: rect.width || 0,
          height: rect.height || 0,
          borderColor: rgb(color.r / 255, color.g / 255, color.b / 255),
          borderWidth: rect.strokeWidth || 1,
        });
      }
    } else if (obj.type === 'circle') {
      const circle = obj as fabric.Circle;
      const fill = circle.fill as string;
      const stroke = circle.stroke as string;
      const radius = circle.radius || 0;
      
      if (fill && fill !== 'transparent') {
        const color = hexToRgb(fill);
        page.drawCircle({
          x: (circle.left || 0) + radius,
          y: (page.getSize().height - (circle.top || 0)) - radius,
          size: radius,
          color: rgb(color.r / 255, color.g / 255, color.b / 255),
        });
      }
      
      if (stroke && stroke !== 'transparent') {
        const color = hexToRgb(stroke);
        page.drawCircle({
          x: (circle.left || 0) + radius,
          y: (page.getSize().height - (circle.top || 0)) - radius,
          size: radius,
          borderColor: rgb(color.r / 255, color.g / 255, color.b / 255),
          borderWidth: circle.strokeWidth || 1,
        });
      }
    }
    // Add more shape types as needed
  }
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

/**
 * Save PDF document as blob
 */
export async function savePDF(pdfDoc: PDFDocument): Promise<Blob> {
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Download PDF blob
 */
export function downloadPDF(blob: Blob, filename: string = 'edited.pdf'): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Add image to PDF page
 */
export async function addImageToPDF(
  pdfDoc: PDFDocument,
  pageIndex: number,
  imageBytes: ArrayBuffer,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  const pages = pdfDoc.getPages();
  const page = pages[pageIndex];
  
  let pdfImage: PDFImage;
  const imageType = getImageType(imageBytes);
  
  if (imageType === 'png') {
    pdfImage = await pdfDoc.embedPng(imageBytes);
  } else {
    pdfImage = await pdfDoc.embedJpg(imageBytes);
  }
  
  page.drawImage(pdfImage, {
    x,
    y: page.getSize().height - y - height,
    width,
    height,
  });
}

/**
 * Detect image type from bytes
 */
function getImageType(bytes: ArrayBuffer): 'png' | 'jpg' {
  const view = new Uint8Array(bytes);
  if (view[0] === 0x89 && view[1] === 0x50) {
    return 'png';
  }
  return 'jpg';
}

/**
 * Extract text and images from PDF page using pdfjs-dist
 * Returns fabric.js objects that can be added to canvas
 */
export async function extractPDFContentToFabric(
  pdfFile: File | ArrayBuffer,
  pageNumber: number,
  scale: number = 1.5
): Promise<{ textObjects: fabric.Textbox[]; imageObjects: fabric.Image[] }> {
  const textObjects: fabric.Textbox[] = [];
  const imageObjects: fabric.Image[] = [];

  try {
    // Dynamically import pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist');
    
    // Set up worker if not already set
    if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }

    // Load PDF
    let arrayBuffer: ArrayBuffer;
    if (pdfFile instanceof File) {
      arrayBuffer = await pdfFile.arrayBuffer();
    } else {
      arrayBuffer = pdfFile;
    }

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    // Extract text content - use normalizeWhitespace: false to preserve exact positions
    // pdfFiller likely uses the actual text layer positions from react-pdf
    const textContent = await page.getTextContent({ normalizeWhitespace: false });
    
    console.log(`Total text items found: ${textContent.items.length}`);
    
    interface TextItem {
      str: string;
      transform: number[];
      fontName?: string;
      x: number;
      y: number;
      fontSize: number;
      fontFamily: string;
      width: number;
      height: number;
    }
    
    const processedItems: TextItem[] = [];
    
    // Process ALL text items without filtering
    for (const textItem of textContent.items) {
      if ('str' in textItem) {
        const str = String(textItem.str || '');
        
        // Include ALL text items, even empty strings or single characters
        if (str !== null && str !== undefined) {
          const transform = textItem.transform || [12, 0, 0, 12, 0, 0];
          
          // Transform matrix: [a, b, c, d, e, f]
          // a, d = horizontal and vertical scale, e, f = translation
          // transform[4] = x (horizontal position)
          // transform[5] = y (vertical position in PDF coordinates, bottom-left origin)
          const fontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || 12;
          const fontHeight = Math.abs(transform[3]) || fontSize;
          
          // Calculate position - match react-pdf text layer exactly
          // The key is to use the same coordinate system as react-pdf's text layer
          // react-pdf uses CSS transforms on text spans, so we need to match that
          
          const x = transform[4] || 0;
          const pdfY = transform[5] || 0;
          
          // react-pdf text layer uses: top = viewport.height - transform[5] - fontSize
          // This is because transform[5] is baseline from bottom, and text layer positions from top
          // We need to match this exactly
          const actualFontHeight = Math.abs(transform[3]) || fontSize;
          
          // react-pdf positions text using the baseline, then adjusts
          // The text layer's top position is: viewport.height - pdfY - actualFontHeight
          // But we need the top of the text box, not the baseline
          const y = viewport.height - pdfY - actualFontHeight;

          // Extract font name (remove encoding prefix if present)
          let fontFamily = 'Arial';
          if ('fontName' in textItem && textItem.fontName) {
            const fontName = String(textItem.fontName);
            // Remove encoding prefix (e.g., "ABCDEF+Arial" -> "Arial")
            const parts = fontName.split('+');
            if (parts.length > 1) {
              fontFamily = parts[parts.length - 1];
            } else {
              const dashParts = fontName.split('-');
              fontFamily = dashParts.length > 1 ? dashParts[dashParts.length - 1] : fontName;
            }
            // Clean up font name
            fontFamily = fontFamily.replace(/^[A-Z0-9]+/, '').trim() || 'Arial';
          }

          // Estimate width and height
          const width = str.length * fontSize * 0.6;
          const height = fontHeight;

          processedItems.push({
            str,
            transform,
            fontName: textItem.fontName as string | undefined,
            x,
            y,
            fontSize,
            fontFamily,
            width,
            height,
          });
        }
      }
    }

    console.log(`Processed ${processedItems.length} text items`);

    // Group text items into paragraphs (like pdfFiller does)
    // Paragraphs are text items on the same line or close together
    const paragraphs: TextItem[][] = [];
    const usedIndices = new Set<number>();

    for (let i = 0; i < processedItems.length; i++) {
      if (usedIndices.has(i)) continue;

      const currentItem = processedItems[i];
      if (currentItem.str.trim().length === 0) continue;

      const paragraph: TextItem[] = [currentItem];
      usedIndices.add(i);

      // Find items that belong to the same paragraph
      // Items on the same line (within 5px vertically) and close horizontally
      for (let j = i + 1; j < processedItems.length; j++) {
        if (usedIndices.has(j)) continue;

        const otherItem = processedItems[j];
        if (otherItem.str.trim().length === 0) continue;

        const yDiff = Math.abs(currentItem.y - otherItem.y);
        
        // Same line (within 5px) - part of same paragraph
        if (yDiff < 5) {
          const lastItem = paragraph[paragraph.length - 1];
          const expectedEndX = lastItem.x + lastItem.width;
          const xDiff = otherItem.x - expectedEndX;
          
          // Close horizontally (within 200px) - continue the paragraph
          if (xDiff < 200 && xDiff > -50) {
            paragraph.push(otherItem);
            usedIndices.add(j);
          }
        } else if (yDiff < 20) {
          // Next line of same paragraph (within 20px vertically)
          const lastItem = paragraph[paragraph.length - 1];
          const xDiff = Math.abs(otherItem.x - lastItem.x);
          
          // Similar horizontal position (within 50px) - same paragraph
          if (xDiff < 50) {
            paragraph.push(otherItem);
            usedIndices.add(j);
            // Update currentItem to this item for next iteration
            const temp = currentItem;
            Object.assign(currentItem, otherItem);
          }
        }
      }

      // Sort paragraph items by position (left to right, top to bottom)
      paragraph.sort((a, b) => {
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) > 5) return yDiff; // Different lines
        return a.x - b.x; // Same line, sort by x
      });

      if (paragraph.length > 0) {
        paragraphs.push(paragraph);
      }
    }

    // Create text objects for each paragraph
    for (const paragraph of paragraphs) {
      if (paragraph.length === 0) continue;

      // Combine all text in paragraph with proper spacing
      let paragraphText = '';
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let paragraphFontSize = paragraph[0].fontSize;
      let paragraphFontFamily = paragraph[0].fontFamily;

      for (let i = 0; i < paragraph.length; i++) {
        const item = paragraph[i];
        paragraphText += item.str;
        
        // Add space between words if there's a gap
        if (i < paragraph.length - 1) {
          const nextItem = paragraph[i + 1];
          const gap = nextItem.x - (item.x + item.width);
          if (gap > 5) {
            paragraphText += ' ';
          }
        }

        minX = Math.min(minX, item.x);
        maxX = Math.max(maxX, item.x + item.width);
        minY = Math.min(minY, item.y);
        maxY = Math.max(maxY, item.y + item.height);
      }

      // Calculate paragraph dimensions
      const paragraphWidth = maxX - minX;
      const paragraphHeight = maxY - minY;

      const textObj = new fabric.Textbox(paragraphText.trim(), {
        left: minX,
        top: minY,
        width: Math.max(paragraphWidth, 100),
        fontSize: paragraphFontSize,
        fontFamily: paragraphFontFamily,
        fill: '#000000',
        opacity: 1,
        stroke: '',
        strokeWidth: 0,
        selectable: true,
        editable: true,
        originX: 'left',
        originY: 'top',
        splitByGrapheme: false,
      });

      textObjects.push(textObj);
    }

    // Add any remaining ungrouped items
    for (let i = 0; i < processedItems.length; i++) {
      if (!usedIndices.has(i)) {
        const item = processedItems[i];
        if (item.str.trim().length === 0) continue;

        const textObj = new fabric.Textbox(item.str || ' ', {
          left: item.x,
          top: item.y,
          width: Math.max(item.width, 50),
          fontSize: item.fontSize,
          fontFamily: item.fontFamily,
          fill: '#000000',
          opacity: 1,
          stroke: '',
          strokeWidth: 0,
          selectable: true,
          editable: true,
          originX: 'left',
          originY: 'top',
        });

        textObjects.push(textObj);
      }
    }

    console.log(`Created ${textObjects.length} paragraph text objects from ${processedItems.length} text items`);
    
    // Note: Images are not extracted as user only needs text editing functionality
  } catch (error) {
    console.error('Error extracting PDF content:', error);
  }

  return { textObjects, imageObjects };
}

/**
 * Clear PDF page content and redraw from canvas
 * This effectively removes original content and replaces with canvas content
 */
export async function clearAndRedrawPDFPage(
  pdfDoc: PDFDocument,
  pageIndex: number,
  fabricCanvas: fabric.Canvas
): Promise<void> {
  const pages = pdfDoc.getPages();
  const page = pages[pageIndex];
  const { width, height } = page.getSize();

  // Create a new blank page to replace the old one
  pdfDoc.removePage(pageIndex);
  const newPage = pdfDoc.insertPage(pageIndex, [width, height]);

  // Apply all canvas objects to the new blank page
  await applyFabricToPDF(pdfDoc, pageIndex, fabricCanvas);
}

