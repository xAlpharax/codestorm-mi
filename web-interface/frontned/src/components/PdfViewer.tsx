import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Download, Loader2 } from 'lucide-react';

// Set the worker source for pdf.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PdfViewerProps {
  documentKey: string;
  documentName?: string;
}

export default function PdfViewer({ documentKey, documentName = 'Document' }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ensure we're using the proper document ID format
  let docId = documentKey;
  if (!docId.startsWith('doc:brasov-cursuri:')) {
    const parts = docId.split(':');
    const lastPart = parts[parts.length - 1];
    docId = `doc:brasov-cursuri:${lastPart}`;
  }

  // Ensure the document key is encoded properly, especially for the case of doc:brasov-cursuri:0
  const encodedKey = encodeURIComponent(docId);
  const pdfUrl = `http://localhost:5020/api/materials/${encodedKey}/pdf`;

  useEffect(() => {
    console.log(`Loading PDF for key: ${docId}, URL: ${pdfUrl}`);
  }, [docId, pdfUrl]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error("Error loading PDF:", error);
    setError("Failed to load PDF document");
    setLoading(false);
  };

  const changePage = (offset: number) => {
    if (!numPages) return;
    const newPage = pageNumber + offset;
    if (newPage >= 1 && newPage <= numPages) {
      setPageNumber(newPage);
    }
  };

  const previousPage = () => changePage(-1);
  const nextPage = () => changePage(1);

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
  const rotate = () => setRotation(prev => (prev + 90) % 360);

  const downloadPdf = () => {
    // Create a temporary anchor element
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `${documentName || 'document'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="w-full bg-gray-100 rounded-t p-3 flex justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={previousPage}
            disabled={pageNumber <= 1}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="text-sm">
            Page {pageNumber} of {numPages || '--'}
          </span>

          <button
            onClick={nextPage}
            disabled={!numPages || pageNumber >= numPages}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={zoomOut}
            className="p-1 rounded hover:bg-gray-200"
            title="Zoom Out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>

          <span className="text-sm">
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={zoomIn}
            className="p-1 rounded hover:bg-gray-200"
            title="Zoom In"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          <button
            onClick={rotate}
            className="p-1 rounded hover:bg-gray-200 ml-2"
            title="Rotate"
          >
            <RotateCw className="w-5 h-5" />
          </button>

          <button
            onClick={downloadPdf}
            className="p-1 rounded hover:bg-gray-200 ml-2"
            title="Download PDF"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="border border-gray-300 rounded-b overflow-auto max-h-[70vh] bg-[#303030] flex justify-center">
        {loading && (
          <div className="flex items-center justify-center min-h-[400px] w-full">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            <span className="ml-2 text-gray-400">Loading PDF...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center min-h-[400px] w-full">
            <div className="text-red-500 text-center">
              <p className="font-bold">Error Loading PDF</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={null}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            rotate={rotation}
            className="m-2"
            renderAnnotationLayer={false}
            renderTextLayer={false}
            loading={null}
          />
        </Document>
      </div>
    </div>
  );
}
