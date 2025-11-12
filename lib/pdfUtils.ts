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
      page.drawText(textObj.text || '', {
        x: obj.left || 0,
        y: (page.getSize().height - (obj.top || 0)) - (obj.height || 0),
        size: textObj.fontSize || 12,
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

