/**
 * Client-side API to communicate with Python PDF extraction service
 * This uses PyMuPDF which is more reliable for image extraction
 */

export interface TextElement {
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
  color: number;
  backgroundColor: string | null;
}

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

export interface ExtractResult {
  textElements: TextElement[];
  imageElements: ImageElement[];
  pageWidth: number;
  pageHeight: number;
  success: boolean;
  error?: string;
}

/**
 * Extract text and images from PDF using Python backend
 */
export async function extractPDFWithPython(
  pdfFile: File | ArrayBuffer,
  pageNumber: number
): Promise<ExtractResult> {
  try {
    // Convert PDF to base64
    let pdfBytes: ArrayBuffer;
    if (pdfFile instanceof File) {
      pdfBytes = await pdfFile.arrayBuffer();
    } else {
      pdfBytes = pdfFile;
    }
    
    const base64 = await arrayBufferToBase64(pdfBytes);
    
    // Call Python API
    const response = await fetch('http://localhost:5000/api/extract-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdfData: base64,
        pageNumber: pageNumber,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error extracting PDF with Python API:', error);
    return {
      textElements: [],
      imageElements: [],
      pageWidth: 612,
      pageHeight: 792,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

