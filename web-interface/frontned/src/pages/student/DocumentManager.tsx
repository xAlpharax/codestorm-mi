import { useState } from 'react';
import MaterialsList from '../../components/MaterialsList';

interface Material {
  text: string;
  title: string;
  timestamp: number;
  name?: string;
  key?: string;
  has_pdf?: boolean;
}

export default function DocumentManager() {
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');

  const handleMaterialSelect = (material: Material | null) => {
    setSelectedMaterial(material);
  };

  const refreshMaterials = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="container mx-auto max-w-full">
      <h1 className="text-xl font-semibold mb-4">Course Materials</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Available Documents</h2>
          <MaterialsList
            key={refreshKey}
            onMaterialSelect={handleMaterialSelect}
            isStudentView={true}
          />
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">
            {selectedMaterial ? 'Document Content' : 'Select a Document'}
          </h2>

          {selectedMaterial ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-lg">
                  {selectedMaterial.name || 'Unnamed Document'}
                </h3>
                <p className="text-sm text-gray-500">
                  {new Date(selectedMaterial.timestamp || 0).toLocaleString()}
                </p>
              </div>

              {selectedMaterial.has_pdf && (
                <div className="bg-blue-50 p-3 rounded-md text-blue-700 text-sm">
                  This document has a PDF version. Please ask your teacher for access.
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex border-b mb-4">
                  <button
                    className={`px-4 py-2 text-sm font-medium ${viewMode === 'formatted'
                      ? 'border-b-2 border-blue-500 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setViewMode('formatted')}
                  >
                    Formatted View
                  </button>
                  <button
                    className={`px-4 py-2 text-sm font-medium ${viewMode === 'raw'
                      ? 'border-b-2 border-blue-500 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setViewMode('raw')}
                  >
                    Raw Text
                  </button>
                </div>

                {viewMode === 'formatted' ? (
                  <div className="prose prose-sm max-w-none max-h-[600px] overflow-y-auto bg-gray-50 p-4 rounded">
                    {selectedMaterial.text && selectedMaterial.text.split('\n').map((paragraph, idx) => (
                      paragraph.trim() ? <p key={idx}>{paragraph}</p> : <br key={idx} />
                    ))}
                    {!selectedMaterial.text && <p className="text-gray-500">No content available</p>}
                  </div>
                ) : (
                  <div className="bg-gray-50 p-4 rounded max-h-[600px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm font-mono">{selectedMaterial.text || 'No content available'}</pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Select a document from the list to view its details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
