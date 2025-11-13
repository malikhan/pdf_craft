# Using pdf-lib for PDF Editing

## Important Note

**pdf-lib is excellent for creating and editing PDFs, but has limitations for extracting content from existing PDFs.**

### pdf-lib Strengths:
- ✅ Creating new PDFs
- ✅ Editing existing PDFs (adding text, images, forms)
- ✅ Saving PDFs with modifications
- ✅ Merging/splitting PDFs
- ✅ Good TypeScript support

### pdf-lib Limitations:
- ❌ Extracting text with positions and styles (limited API)
- ❌ Extracting images with positions (doesn't expose this easily)
- ❌ Reading PDF content structure (designed for writing, not reading)

## Recommended Approach

**Hybrid Solution:**
1. **Extract** using PDF.js (better for reading) - Keep current implementation
2. **Edit** in browser with React components - Current implementation
3. **Save** using pdf-lib (better for writing) - Use the new `pdfLibSave.ts`

## Files Created

1. **`lib/pdfLibSave.ts`** - Use pdf-lib to save edited PDFs
   - Covers original text with white rectangles
   - Draws new text with correct fonts and styles
   - Much more reliable than trying to modify PDF.js output

2. **`lib/pdfLibExtract.ts`** - Attempted pdf-lib extraction (limited)
   - Shows pdf-lib's limitations for extraction
   - Can identify images but can't easily get positions or extract bytes

## Usage

### For Saving (Recommended - Use pdf-lib):

```typescript
import { saveEditedPDFWithPdfLib } from '@/lib/pdfLibSave';

// After user edits text
const editedPdfBytes = await saveEditedPDFWithPdfLib(
  originalPdfFile,
  editedTextElements,
  currentPage
);

// Download or save
const blob = new Blob([editedPdfBytes], { type: 'application/pdf' });
const url = URL.createObjectURL(blob);
// ... download logic
```

### For Extraction (Keep using PDF.js):

The current `PdfTextEditorClean.tsx` already uses PDF.js for extraction, which is the right approach.

## Why This Hybrid Approach?

- **PDF.js** is built by Mozilla specifically for rendering and reading PDFs
- **pdf-lib** is built specifically for creating and editing PDFs
- Using each library for what it's best at gives the best results

## Alternative: Pure pdf-lib Approach

If you really want to use only pdf-lib, you would need to:
1. Parse the PDF's content stream manually (very complex)
2. Extract images by decoding PDF streams yourself (very complex)
3. Rebuild the PDF structure (defeats the purpose)

This is why the hybrid approach is recommended.

