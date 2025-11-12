import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pdfData, filename = 'edited.pdf' } = body;

    if (!pdfData) {
      return NextResponse.json(
        { error: 'No PDF data provided' },
        { status: 400 }
      );
    }

    // If pdfData is base64, decode it
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
      // Already Uint8Array
      pdfBytes = new Uint8Array(pdfData);
    }

    // Load and validate PDF
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // In a production app, you might want to:
    // - Save to cloud storage
    // - Add watermarks or signatures
    // - Merge with other PDFs
    // - Return a download URL

    // Return the PDF as base64 for client-side download
    const savedBytes = await pdfDoc.save();
    const base64 = Buffer.from(savedBytes).toString('base64');

    return NextResponse.json({
      success: true,
      pdfData: base64,
      filename,
    });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json(
      { error: 'Failed to save PDF' },
      { status: 500 }
    );
  }
}

