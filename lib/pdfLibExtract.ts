/**
 * PDF extraction using pdf-lib
 * pdf-lib is better for editing but has limitations with extraction
 * We'll use it to access PDF structure and extract images
 */

import { PDFDocument } from 'pdf-lib';

export interface ImageElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  pageWidth: number;
  pageHeight: number;
}

/**
 * Extract images from PDF using pdf-lib's low-level API
 * This accesses the PDF context directly to get image streams
 */
export async function extractImagesWithPdfLib(
  pdfFile: File | ArrayBuffer,
  pageNumber: number
): Promise<{ images: ImageElement[]; pageWidth: number; pageHeight: number }> {
  try {
    let pdfBytes: ArrayBuffer;
    if (pdfFile instanceof File) {
      pdfBytes = await pdfFile.arrayBuffer();
    } else {
      pdfBytes = pdfFile;
    }

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const page = pages[pageNumber - 1];
    
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    
    console.log('pdf-lib: Page dimensions:', { pageWidth, pageHeight });
    
    const images: ImageElement[] = [];
    
    // Access PDF context to get indirect objects (low-level API)
    const context = (pdfDoc as any).context;
    const indirectObjects = context.enumerateIndirectObjects();
    
    console.log(`pdf-lib: Found ${indirectObjects.length} indirect objects`);
    
    let imageCounter = 0;
    for (const [ref, object] of indirectObjects) {
      try {
        // Check if this is an image stream
        if (object && typeof object === 'object' && 'dict' in object) {
          const dict = (object as any).dict;
          const subtype = dict?.lookup?.('Subtype')?.name;
          
          if (subtype === 'Image') {
            console.log(`pdf-lib: Found image object at ref ${ref}`);
            
            // Get image stream
            const stream = (object as any).contents;
            if (stream) {
              // Get image dimensions from dictionary
              const width = dict?.lookup?.('Width')?.value || 0;
              const height = dict?.lookup?.('Height')?.value || 0;
              const colorSpace = dict?.lookup?.('ColorSpace')?.name || 'DeviceRGB';
              const bitsPerComponent = dict?.lookup?.('BitsPerComponent')?.value || 8;
              
              console.log(`pdf-lib: Image ${imageCounter}: ${width}x${height}, ${colorSpace}, ${bitsPerComponent} bits`);
              
              // Try to decode image data
              // pdf-lib doesn't expose decoded image bytes easily
              // We'll need to use PDF.js for actual image extraction
              // But we can use pdf-lib to identify which images exist
            }
          }
        }
      } catch (objError) {
        // Skip objects that can't be processed
        continue;
      }
    }
    
    // Note: pdf-lib is better for creating/editing PDFs, not extracting
    // For actual image extraction with positions, we still need PDF.js
    // But we can use pdf-lib to validate the PDF structure
    
    return {
      images, // Will be empty - pdf-lib can't easily extract image bytes with positions
      pageWidth,
      pageHeight,
    };
  } catch (error) {
    console.error('pdf-lib: Error extracting images:', error);
    return {
      images: [],
      pageWidth: 612,
      pageHeight: 792,
    };
  }
}

