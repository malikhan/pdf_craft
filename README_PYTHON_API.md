# Python PDF Extraction API Setup

This project includes a Python backend API using PyMuPDF (fitz) for more reliable PDF text and image extraction.

## Why Python Backend?

- **PyMuPDF (fitz)** is one of the most reliable libraries for PDF image extraction
- Better handling of complex PDF structures
- More accurate text positioning and style extraction
- Native support for image extraction with positions

## Setup Instructions

### 1. Install Python Dependencies

```bash
cd api
pip install -r requirements.txt
```

### 2. Start Python API Server

```bash
python pdf-extract.py
```

The API will run on `http://localhost:5000`

### 3. Update Next.js Component

In `components/PdfTextEditorClean.tsx`, you can optionally use the Python API:

```typescript
import { extractPDFWithPython } from '@/lib/pdfExtractAPI';

// In your extraction function:
const result = await extractPDFWithPython(pdfFile, currentPage);
if (result.success) {
  setTextElements(result.textElements);
  setImageElements(result.imageElements);
}
```

## Alternative: Use pdf-lib (Node.js)

If you prefer to stay in JavaScript/Node.js, `pdf-lib` is more reliable than PDF.js for editing:

```bash
npm install pdf-lib
```

`pdf-lib` is better for:
- Creating new PDFs
- Editing existing PDFs
- Adding text and images
- But still has limitations with image extraction from existing PDFs

## Recommendation

For best results:
1. **Extract** using Python + PyMuPDF (more reliable)
2. **Edit** in the browser with your current React components
3. **Save** using pdf-lib or send back to Python API to regenerate PDF

