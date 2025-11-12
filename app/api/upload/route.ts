import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate PDF file
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF files are allowed.' },
        { status: 400 }
      );
    }

    // Convert file to array buffer for client-side processing
    const arrayBuffer = await file.arrayBuffer();

    // In a production app, you might want to:
    // - Save the file to cloud storage (S3, etc.)
    // - Process the PDF server-side
    // - Return a file ID or URL

    return NextResponse.json({
      success: true,
      message: 'File uploaded successfully',
      size: arrayBuffer.byteLength,
      filename: file.name,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

