"""
Python API endpoint for extracting text and images from PDFs using PyMuPDF
This is more reliable than PDF.js for image extraction
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz  # PyMuPDF
import base64
import io
from typing import List, Dict, Any

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js frontend

def extract_pdf_content(pdf_bytes: bytes, page_number: int = 1) -> Dict[str, Any]:
    """
    Extract text and images from a PDF page using PyMuPDF
    
    Args:
        pdf_bytes: PDF file as bytes
        page_number: Page number (1-indexed)
    
    Returns:
        Dictionary with text elements and images
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    
    try:
        # Get the page (0-indexed)
        page = doc.load_page(page_number - 1)
        
        # Extract text with positions and styles
        text_dict = page.get_text("dict")
        
        # Extract images
        images_list = page.get_images(full=True)
        
        # Process text blocks
        text_elements = []
        for block in text_dict.get("blocks", []):
            if "lines" in block:  # Text block
                for line in block["lines"]:
                    for span in line.get("spans", []):
                        text_elements.append({
                            "text": span.get("text", ""),
                            "x": span.get("bbox", [0, 0, 0, 0])[0],
                            "y": span.get("bbox", [0, 0, 0, 0])[1],
                            "width": span.get("bbox", [0, 0, 0, 0])[2] - span.get("bbox", [0, 0, 0, 0])[0],
                            "height": span.get("bbox", [0, 0, 0, 0])[3] - span.get("bbox", [0, 0, 0, 0])[1],
                            "fontSize": span.get("size", 12),
                            "fontFamily": span.get("font", "Arial"),
                            "fontWeight": "bold" if "bold" in span.get("font", "").lower() else "normal",
                            "fontStyle": "italic" if "italic" in span.get("font", "").lower() else "normal",
                            "color": span.get("color", 0),
                            "backgroundColor": None,  # PyMuPDF doesn't directly provide this
                        })
        
        # Process images
        image_elements = []
        for img_index, img in enumerate(images_list):
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            image_ext = base_image["ext"]
            
            # Get image position from page
            image_rects = page.get_image_rects(xref)
            if image_rects:
                rect = image_rects[0]  # Get first occurrence
                # Convert to base64
                image_base64 = base64.b64encode(image_bytes).decode('utf-8')
                mime_type = f"image/{image_ext}" if image_ext != "jpeg" else "image/jpeg"
                image_data_url = f"data:{mime_type};base64,{image_base64}"
                
                image_elements.append({
                    "id": f"image-{img_index}",
                    "x": rect.x0,
                    "y": rect.y0,
                    "width": rect.width,
                    "height": rect.height,
                    "src": image_data_url,
                    "pageWidth": page.rect.width,
                    "pageHeight": page.rect.height,
                })
        
        return {
            "textElements": text_elements,
            "imageElements": image_elements,
            "pageWidth": page.rect.width,
            "pageHeight": page.rect.height,
            "success": True
        }
    
    finally:
        doc.close()

@app.route('/api/extract-pdf', methods=['POST'])
def extract_pdf():
    """
    API endpoint to extract text and images from PDF
    Expects: { "pdfData": base64_string, "pageNumber": int }
    """
    try:
        data = request.json
        pdf_base64 = data.get('pdfData')
        page_number = data.get('pageNumber', 1)
        
        if not pdf_base64:
            return jsonify({"error": "No PDF data provided"}), 400
        
        # Decode base64 PDF
        pdf_bytes = base64.b64decode(pdf_base64)
        
        # Extract content
        result = extract_pdf_content(pdf_bytes, page_number)
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)

