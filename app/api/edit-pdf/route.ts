import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, PDFFont, PDFPage } from 'pdf-lib';

interface EditedTextItem {
  text: string;
  x: number; // Position in viewport coordinates (from client)
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight?: string;
  fontStyle?: string;
  originalText?: string; // Original text to be replaced
}

interface EditPDFRequest {
  pdfData: string | number[]; // Base64 or array
  pageNumber: number; // 1-indexed
  editedTexts: EditedTextItem[];
  pdfPageDimensions?: {
    width: number; // Viewport width
    height: number; // Viewport height
  };
  filename?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: EditPDFRequest = await request.json();
    const { pdfData, pageNumber, editedTexts, pdfPageDimensions, filename = 'edited.pdf' } = body;

    if (!pdfData || !editedTexts || editedTexts.length === 0) {
      return NextResponse.json(
        { error: 'Missing required data: pdfData and editedTexts are required' },
        { status: 400 }
      );
    }

    // Decode PDF data
    let pdfBytes: Uint8Array;
    if (typeof pdfData === 'string') {
      // Base64 encoded
      const binaryString = atob(pdfData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      pdfBytes = bytes;
    } else {
      // Array of numbers
      pdfBytes = new Uint8Array(pdfData);
    }

    // Load PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    
    if (pageNumber < 1 || pageNumber > pages.length) {
      return NextResponse.json(
        { error: `Invalid page number: ${pageNumber}. PDF has ${pages.length} pages.` },
        { status: 400 }
      );
    }

    const page = pages[pageNumber - 1]; // Convert to 0-indexed
    const { width: pdfWidth, height: pdfHeight } = page.getSize();

    // Calculate scale factors to convert from viewport coordinates to PDF coordinates
    // Default viewport scale is 1.5 (from react-pdf)
    const viewportScale = 1.5;
    const viewportWidth = pdfPageDimensions?.width || (pdfWidth * viewportScale);
    const viewportHeight = pdfPageDimensions?.height || (pdfHeight * viewportScale);
    
    const scaleX = pdfWidth / viewportWidth;
    const scaleY = pdfHeight / viewportHeight;

    // Embed fonts - try to match original fonts
    const fontCache = new Map<string, PDFFont>();
    
    const getOrEmbedFont = async (fontFamily: string, fontWeight: string = 'normal', fontStyle: string = 'normal'): Promise<PDFFont> => {
      const fontKey = `${fontFamily}-${fontWeight}-${fontStyle}`;
      
      if (fontCache.has(fontKey)) {
        return fontCache.get(fontKey)!;
      }

      try {
        // Try to embed the font - pdf-lib supports standard fonts
        // Map common font families to pdf-lib fonts
        let font: PDFFont;
        
        if (fontFamily.toLowerCase().includes('times') || fontFamily.toLowerCase().includes('serif')) {
          font = fontStyle === 'italic' 
            ? (fontWeight === 'bold' ? await pdfDoc.embedFont('Times-BoldItalic') : await pdfDoc.embedFont('Times-Italic'))
            : (fontWeight === 'bold' ? await pdfDoc.embedFont('Times-Bold') : await pdfDoc.embedFont('Times-Roman'));
        } else if (fontFamily.toLowerCase().includes('courier') || fontFamily.toLowerCase().includes('mono')) {
          font = fontStyle === 'italic'
            ? (fontWeight === 'bold' ? await pdfDoc.embedFont('Courier-BoldOblique') : await pdfDoc.embedFont('Courier-Oblique'))
            : (fontWeight === 'bold' ? await pdfDoc.embedFont('Courier-Bold') : await pdfDoc.embedFont('Courier'));
        } else {
          // Default to Helvetica (sans-serif)
          font = fontStyle === 'italic'
            ? (fontWeight === 'bold' ? await pdfDoc.embedFont('Helvetica-BoldOblique') : await pdfDoc.embedFont('Helvetica-Oblique'))
            : (fontWeight === 'bold' ? await pdfDoc.embedFont('Helvetica-Bold') : await pdfDoc.embedFont('Helvetica'));
        }
        
        fontCache.set(fontKey, font);
        return font;
      } catch (error) {
        console.warn(`Failed to embed font ${fontKey}, using Helvetica:`, error);
        // Fallback to Helvetica
        const fallbackFont = await pdfDoc.embedFont('Helvetica');
        fontCache.set(fontKey, fallbackFont);
        return fallbackFont;
      }
    };

    // Process each edited text item
    for (const textItem of editedTexts) {
      if (!textItem.text.trim()) {
        // If text is empty, just cover the original (user deleted it)
        // Convert coordinates from viewport to PDF
        const pdfX = textItem.x * scaleX;
        const pdfY = pdfHeight - (textItem.y * scaleY) - (textItem.height * scaleY);
        const pdfWidth_rect = textItem.width * scaleX;
        const pdfHeight_rect = textItem.height * scaleY;

        // Draw white rectangle to cover original text
        page.drawRectangle({
          x: pdfX,
          y: pdfY,
          width: pdfWidth_rect,
          height: pdfHeight_rect,
          color: rgb(1, 1, 1), // White
        });
        continue;
      }

      // Convert coordinates from viewport (top-left origin) to PDF (bottom-left origin)
      const pdfX = textItem.x * scaleX;
      // PDF Y is from bottom, viewport Y is from top
      // pdfY = pdfHeight - (viewportY * scaleY) - (fontSize * scaleY)
      const pdfFontSize = textItem.fontSize * scaleY;
      const pdfY = pdfHeight - (textItem.y * scaleY) - pdfFontSize;

      // Cover the original text area with white rectangle
      const coverX = textItem.x * scaleX;
      const coverY = pdfHeight - (textItem.y * scaleY) - (textItem.height * scaleY);
      const coverWidth = textItem.width * scaleX;
      const coverHeight = textItem.height * scaleY;

      page.drawRectangle({
        x: coverX,
        y: coverY,
        width: coverWidth,
        height: coverHeight,
        color: rgb(1, 1, 1), // White background to cover original
      });

      // Draw new text
      try {
        const font = await getOrEmbedFont(
          textItem.fontFamily || 'Helvetica',
          textItem.fontWeight || 'normal',
          textItem.fontStyle || 'normal'
        );

        page.drawText(textItem.text, {
          x: pdfX,
          y: pdfY,
          size: pdfFontSize,
          font: font,
          color: rgb(0, 0, 0), // Black text
        });
      } catch (error) {
        console.error('Error drawing text:', error, textItem);
        // Continue with other text items even if one fails
      }
    }

    // Save the modified PDF
    const savedBytes = await pdfDoc.save();
    const base64 = Buffer.from(savedBytes).toString('base64');

    return NextResponse.json({
      success: true,
      pdfData: base64,
      filename,
      message: `Successfully edited page ${pageNumber}`,
    });
  } catch (error) {
    console.error('PDF edit error:', error);
    return NextResponse.json(
      { error: 'Failed to edit PDF', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

