# PDF Craft - Online PDF Editor

A modern, full-stack Next.js application for editing PDFs online. Built with TypeScript, Tailwind CSS, ShadCN/UI, pdf-lib, react-pdf, and fabric.js.

## Features

- 📄 Upload and view PDF files
- ✏️ Edit text directly on PDFs
- 🎨 Draw and highlight
- 🔷 Add shapes (rectangles, circles, arrows)
- 🖼️ Add images and text boxes
- 🗑️ Delete or reorder pages
- 💾 Download/export edited PDFs
- 🆕 Create blank new PDFs
- ↶ Undo/Redo functionality

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** + **ShadCN/UI**
- **pdf-lib** - PDF creation/editing/exporting
- **react-pdf** - PDF rendering
- **fabric.js** - Graphical overlays and editing
- **react-dropzone** - File uploads

## Getting Started

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
pdfcraft/
├── app/
│   ├── page.tsx                  # Main editor page
│   ├── api/
│   │   ├── save/route.ts         # Endpoint for saving/exporting PDF
│   │   └── upload/route.ts       # Endpoint for uploading PDF
│   └── layout.tsx                # Root layout
├── components/
│   ├── EditorCanvas.tsx          # Fabric.js canvas for editing
│   ├── Toolbar.tsx               # Top toolbar with tools
│   ├── FileUpload.tsx            # Drag-and-drop uploader
│   ├── Sidebar.tsx               # Properties sidebar
│   ├── PdfViewer.tsx             # PDF page renderer
│   └── ui/                       # ShadCN UI components
├── lib/
│   ├── pdfUtils.ts               # PDF manipulation utilities
│   ├── fileUtils.ts              # File handling utilities
│   └── utils.ts                  # General utilities
└── styles/
    └── globals.css               # Global styles
```

## Usage

1. **Upload a PDF**: Click the upload button or drag & drop a PDF file
2. **Create New PDF**: Click "New PDF" to start with a blank document
3. **Edit**: Use the toolbar to select tools (text, shapes, draw, etc.)
4. **Customize**: Open the sidebar to adjust colors, sizes, and fonts
5. **Save**: Click the save button to download your edited PDF

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## License

MIT

