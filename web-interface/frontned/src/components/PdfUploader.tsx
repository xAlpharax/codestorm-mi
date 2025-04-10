import { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, FileText, Loader2, Check, X, RefreshCw, AlertCircle, FilePlus } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source for pdf.js using a CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

interface PdfUploaderProps {
  onUploadComplete?: () => void;
}

export default function PdfUploader({ onUploadComplete }: PdfUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [aiGeneratedName, setAiGeneratedName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [step, setStep] = useState<'select' | 'extract' | 'confirm' | 'uploading' | 'success'>('select');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
      setStep('extract');
      // Auto-generate title from filename
      if (selectedFile.name) {
        const filename = selectedFile.name.replace('.pdf', '');
        setTitle(filename);
      }
    } else {
      setError('Please select a valid PDF file');
      setFile(null);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const droppedFiles = event.dataTransfer.files;
    if (droppedFiles.length > 0) {
      const droppedFile = droppedFiles[0];

      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
        setError(null);
        setStep('extract');
        // Auto-generate title from filename
        if (droppedFile.name) {
          const filename = droppedFile.name.replace('.pdf', '');
          setTitle(filename);
        }
      } else {
        setError('Please drop a valid PDF file');
      }
    }
  };

  const extractTextFromPdf = async (pdfFile: File): Promise<string> => {
    try {
      // Convert the PDF file to an ArrayBuffer
      const arrayBuffer = await pdfFile.arrayBuffer();

      // Load the PDF document
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';

      // Extract text from each page with progress updates
      const totalPages = pdf.numPages;

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';

        // Update progress percentage for extraction
        setUploadProgress(Math.round((i / totalPages) * 100));
      }

      return fullText.trim();
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error('Failed to extract text from PDF');
    }
  };

  const uploadToApi = async (text: string, title: string) => {
    try {
      setUploadProgress(0);

      // Convert the file to a base64 string if available
      let pdfBase64: string | null = null;

      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
        pdfBase64 = btoa(binary);
      }

      const response = await fetch('http://localhost:5020/api/materials/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          title,
          pdf_data: pdfBase64 // Send the PDF binary data
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      setUploadProgress(100);

      const data = await response.json();

      if (!data || !data.success) {
        throw new Error('Invalid response from server');
      }

      // Get the AI-generated name from the response
      if (data && data.name) {
        setAiGeneratedName(data.name);
      }

      return data;
    } catch (error) {
      console.error('Error uploading to API:', error);
      throw error;
    }
  };

  const handleExtract = async () => {
    if (!file) {
      setError('Please select a PDF file first');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setUploadProgress(0);

      // Extract text from PDF
      const text = await extractTextFromPdf(file);
      setExtractedText(text);
      setStep('confirm');
    } catch (err) {
      setError('Failed to extract text from the PDF');
      console.error('Error:', err);
      setStep('select');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!extractedText) {
      setError('No text to upload');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setStep('uploading');

      // Upload to API
      await uploadToApi(extractedText, title);

      // Show success state briefly
      setStep('success');

      // Reset form after 2 seconds
      setTimeout(() => {
        setFile(null);
        setExtractedText('');
        setTitle('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        // Notify parent component
        if (onUploadComplete) {
          onUploadComplete();
        }

        // Reset to initial state
        setStep('select');
      }, 2000);

    } catch (err) {
      setError('Failed to upload to API');
      console.error('Error:', err);
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setExtractedText('');
    setTitle('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setStep('select');
    setError(null);
  };

  return (
    <div className="space-y-4">
      {step === 'select' && (
        <div
          className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors bg-gray-50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
            ref={fileInputRef}
            id="pdf-upload"
          />
          <label
            htmlFor="pdf-upload"
            className="flex flex-col items-center cursor-pointer w-full py-4"
          >
            <FilePlus className="w-16 h-16 text-blue-400 mb-2" />
            <span className="text-base font-medium text-gray-700 mb-1">
              Drop your PDF here or click to browse
            </span>
            <span className="text-sm text-gray-500">
              Supports PDF files up to 10MB
            </span>
          </label>
        </div>
      )}

      {step === 'extract' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded flex items-center">
            <FileText className="w-8 h-8 text-blue-500 mr-3" />
            <div>
              <h3 className="font-semibold">{file?.name}</h3>
              <p className="text-sm text-gray-600">{(file?.size || 0) / 1024 < 1000
                ? `${Math.round((file?.size || 0) / 1024)} KB`
                : `${((file?.size || 0) / 1024 / 1024).toFixed(2)} MB`}
              </p>
            </div>
          </div>

          <button
            onClick={handleExtract}
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-3 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Extracting Text...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5 mr-2" />
                Extract Text from PDF
              </>
            )}
          </button>

          <button
            onClick={handleCancel}
            className="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {(step === 'extract' || step === 'uploading') && loading && uploadProgress > 0 && (
        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-1 text-center">
            {step === 'extract' ? 'Extracting' : 'Uploading'}: {uploadProgress}%
          </p>
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded">
            <h3 className="font-semibold mb-2">Extracted Text Preview:</h3>
            <div className="max-h-32 overflow-y-auto border p-2 rounded bg-white">
              <p className="text-sm whitespace-pre-wrap line-clamp-6">{extractedText}</p>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {extractedText.length} characters extracted • {extractedText.split(/\s+/).length} words
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Document Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter a title for this document"
            />
          </div>

          <div className="flex space-x-2">
            <button
              onClick={handleCancel}
              className="flex-1 flex items-center justify-center px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 flex items-center justify-center px-4 py-3 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Upload Document
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 'uploading' && (
        <div className="p-6 bg-blue-50 rounded text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin text-blue-500" />
          <p className="text-blue-700 font-medium">Uploading document to database...</p>
          <p className="text-sm text-blue-600 mt-1">This may take a moment</p>
        </div>
      )}

      {step === 'success' && (
        <div className="p-6 bg-green-50 rounded text-center">
          <Check className="w-10 h-10 mx-auto mb-3 text-green-500 p-1 bg-green-100 rounded-full" />
          <p className="text-green-700 font-medium">Document uploaded successfully!</p>
          {aiGeneratedName && (
            <p className="text-sm text-green-600 mt-1">
              Generated name: <span className="font-medium">{aiGeneratedName}</span>
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-start">
          <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
