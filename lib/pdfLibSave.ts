/**
 * Save edited PDF using pdf-lib
 * pdf-lib is excellent for creating and editing PDFs
 * Use this to save the edited text back to the PDF
 */

import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib';
import { TextElement } from './pdfLibExtract';

/**
 * Save edited text to PDF using pdf-lib
 * This covers the original text with white rectangles and draws new text
 */
export async function saveEditedPDFWithPdfLib(
  originalPdfFile: File | ArrayBuffer,
  editedTexts: TextElement[],
  pageNumber: number
): Promise<Uint8Array> {
  try {
    // Load original PDF
    let pdfBytes: ArrayBuffer;
    if (originalPdfFile instanceof File) {
      pdfBytes = await originalPdfFile.arrayBuffer();
    } else {
      pdfBytes = originalPdfFile;
    }

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const page = pages[pageNumber - 1];
    
    // Load a font for drawing text
    // pdf-lib comes with built-in fonts
    const font = await pdfDoc.embedFont('Helvetica');
    const boldFont = await pdfDoc.embedFont('Helvetica-Bold');
    const italicFont = await pdfDoc.embedFont('Helvetica-Oblique');
    
    // For each edited text element:
    for (const textElement of editedTexts) {
      // 1. Draw white rectangle to cover original text
      page.drawRectangle({
        x: textElement.x,
        y: textElement.pageHeight - textElement.y - textElement.height, // Convert to PDF coordinates
        width: textElement.width,
        height: textElement.height,
        color: rgb(1, 1, 1), // White
      });
      
      // 2. Draw new text
      let fontToUse = font;
      if (textElement.fontWeight === 'bold' && textElement.fontStyle === 'italic') {
        // Would need Helvetica-BoldOblique, but use bold for now
        fontToUse = boldFont;
      } else if (textElement.fontWeight === 'bold') {
        fontToUse = boldFont;
      } else if (textElement.fontStyle === 'italic') {
        fontToUse = italicFont;
      }
      
      // Convert color if provided
      let textColor = rgb(0, 0, 0); // Default black
      if (textElement.color) {
        // Parse color string (e.g., "rgb(255, 0, 0)" or "#ff0000")
        const rgbMatch = textElement.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
          textColor = rgb(
            parseInt(rgbMatch[1]) / 255,
            parseInt(rgbMatch[2]) / 255,
            parseInt(rgbMatch[3]) / 255
          );
        } else if (textElement.color.startsWith('#')) {
          const hex = textElement.color.substring(1);
          textColor = rgb(
            parseInt(hex.substring(0, 2), 16) / 255,
            parseInt(hex.substring(2, 4), 16) / 255,
            parseInt(hex.substring(4, 6), 16) / 255
          );
        }
      }
      
      // Draw text
      page.drawText(textElement.text, {
        x: textElement.x,
        y: textElement.pageHeight - textElement.y - textElement.fontSize, // Convert to PDF coordinates
        size: textElement.fontSize,
        font: fontToUse,
        color: textColor,
      });
    }
    
    // Save PDF
    const pdfBytesOut = await pdfDoc.save();
    return pdfBytesOut;
  } catch (error) {
    console.error('pdf-lib: Error saving PDF:', error);
    throw error;
  }
}

