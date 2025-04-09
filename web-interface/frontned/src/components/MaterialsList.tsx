import { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, FileText, Clock, Calendar, Trash2, AlertCircle, Zap } from 'lucide-react';

interface Material {
  text: string;
  title: string;
  timestamp: number;
  name?: string;
  key?: string;
}

interface SyncResultsDeletedKey {
  key: string;
  content: string;
}

interface SyncResultsNamedKey {
  key: string;
  name: string;
  preview: string;
}

interface SyncResults {
  total: number;
  processed: number;
  already_named: number;
  named: number;
  deleted: number;
  errors: number;
  summary: string;
  deleted_keys: SyncResultsDeletedKey[];
  named_keys: SyncResultsNamedKey[];
}

interface MaterialsListProps {
  onMaterialSelect?: (material: Material | null) => void;
  isStudentView?: boolean;
}

export default function MaterialsList({ onMaterialSelect, isStudentView = false }: MaterialsListProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [syncingName, setSyncingName] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncResults, setSyncResults] = useState<any>({});

  const fetchMaterials = async (pageNum: number) => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get('http://10.0.12.9:5020/api/materials', {
        timeout: 10000
      });

      if (!response.data || !response.data.success) {
        throw new Error('Server returned an invalid response');
      }

      // Map the response to our Material interface
      const documents = response.data.documents || [];
      const mappedMaterials = documents.map((doc: any) => ({
        text: doc.content || '',
        title: '',
        timestamp: 0,
        name: doc.name || '',
        key: doc.id || '',
        has_pdf: doc.has_pdf || false
      }));

      setMaterials(mappedMaterials);
      setTotalPages(1);
      setPage(1);

    } catch (err: any) {
      console.error('Error fetching materials:', err);
      setError(`Failed to load documents: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const syncDocumentName = async (key: string) => {
    try {
      setSyncingName(key);
      setError(null);

      let maxRetries = 2;
      let retryCount = 0;
      let success = false;
      let response;

      while (!success && retryCount <= maxRetries) {
        try {
          response = await axios.post('http://10.0.12.9:5020/api/materials/sync-name',
            { key },
            {
              headers: {
                'Content-Type': 'application/json'
              },
              timeout: 15000 // 15 second timeout
            }
          );

          if (response.data && response.data.success) {
            success = true;
          } else {
            throw new Error('Server returned an invalid response');
          }
        } catch (err) {
          retryCount++;
          if (retryCount > maxRetries) throw err;

          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log(`Retrying name sync for ${key} (attempt ${retryCount} of ${maxRetries})...`);
        }
      }

      if (success && response && response.data.name) {
        // Update the material with the new name
        setMaterials(prevMaterials =>
          prevMaterials.map(material =>
            material.key === key
              ? { ...material, name: response!.data.name }
              : material
          )
        );
      } else {
        setError('Failed to generate name: The AI name generator may be having issues.');
      }
    } catch (err: any) {
      console.error('Error syncing document name:', err);
      setError(`Failed to sync document name: ${err.message || 'Unknown error'}`);
    } finally {
      setSyncingName(null);
    }
  };

  const handleSyncAll = async () => {
    try {
      setSyncingAll(true);
      setSyncResults(null);
      setError(null);

      // Add a timeout to avoid UI freezing
      await new Promise(resolve => setTimeout(resolve, 100));

      let maxRetries = 2;
      let retryCount = 0;
      let success = false;
      let response;

      while (!success && retryCount <= maxRetries) {
        try {
          response = await axios.post('http://10.0.12.9:5020/api/materials/sync-all', {}, {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
          });

          if (response.data && response.data.success) {
            success = true;
          } else {
            throw new Error('Server returned an invalid response');
          }
        } catch (err) {
          retryCount++;
          if (retryCount > maxRetries) throw err;

          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log(`Retrying sync (attempt ${retryCount} of ${maxRetries})...`);
        }
      }

      if (success && response) {
        setSyncResults(response.data.results);

        // Refresh materials to show new names and remove deleted items
        await fetchMaterials(page);

        // If there were more errors than successes, show a warning
        const { named, errors } = response.data.results;
        if (errors > named && errors > 0) {
          setError('Some documents could not be named. The AI name generator may be having issues.');
        }
      }
    } catch (err: any) {
      console.error('Error syncing all documents:', err);
      setError(`Failed to sync documents: ${err.message || 'Unknown error'}`);
    } finally {
      setSyncingAll(false);
    }
  };

  const handleDeleteMaterial = async (key: string) => {
    try {
      setDeletingKey(key);
      setError(null);

      const response = await axios.post('http://10.0.12.9:5020/api/materials/delete',
        { key },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (!response.data || !response.data.success) {
        throw new Error('Server returned an invalid response');
      }

      // Remove the material from the list
      setMaterials(prevMaterials =>
        prevMaterials.filter(material => material.key !== key)
      );

      // If the deleted material was selected, clear the selection
      if (activeIndex !== null && materials[activeIndex]?.key === key) {
        setActiveIndex(null);
        if (onMaterialSelect) {
          onMaterialSelect(null);
        }
      } else if (activeIndex !== null && materials.length > 0) {
        // Adjust activeIndex if necessary
        const newActiveIndex = activeIndex >= materials.length - 1 ? materials.length - 2 : activeIndex;
        if (newActiveIndex >= 0) {
          setActiveIndex(newActiveIndex);
          if (onMaterialSelect) {
            onMaterialSelect(materials[newActiveIndex]);
          }
        }
      }

    } catch (err: any) {
      console.error('Error deleting material:', err);
      setError(`Failed to delete document: ${err.message || 'Unknown error'}`);
    } finally {
      setDeletingKey(null);
      setDeleteConfirmKey(null);
    }
  };

  useEffect(() => {
    fetchMaterials(page);
  }, [page]);

  // Select the first document automatically when materials are loaded
  useEffect(() => {
    if (materials.length > 0 && activeIndex === null) {
      setActiveIndex(0);
      if (onMaterialSelect) onMaterialSelect(materials[0]);
    } else if (materials.length === 0) {
      setActiveIndex(null);
      if (onMaterialSelect) onMaterialSelect(null);
    }
  }, [materials, onMaterialSelect]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      setActiveIndex(null); // Reset active index when changing pages
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getDisplayName = (material: Material) => {
    // First check if a name exists (AI-generated name)
    if (material.name && material.name !== material.key) {
      return material.name;
    }

    // If the name is just the key (fallback in backend), extract timestamp as ID
    if (material.key) {
      const timestamp = material.key.split(':').pop();
      // Special handling for timestamp 0
      if (timestamp === '0') {
        return 'Initial Document';
      }
      return `Document #${timestamp || 'unknown'}`;
    }

    // Final fallback
    return 'Unnamed Document';
  };

  const navigateDocuments = (direction: 'next' | 'prev') => {
    if (materials.length === 0) return;

    if (activeIndex === null) {
      // If no document is selected, select the first one
      setActiveIndex(0);
      onMaterialSelect?.(materials[0]);
      return;
    }

    if (direction === 'next') {
      // If at the end of the current page, go to next page
      if (activeIndex === materials.length - 1) {
        if (page < totalPages) {
          handlePageChange(page + 1);
          // Select first item on next page after it loads
          setTimeout(() => {
            setActiveIndex(0);
            if (materials.length > 0) onMaterialSelect?.(materials[0]);
          }, 500);
        }
        return;
      }

      // Otherwise select next item
      const nextIndex = activeIndex + 1;
      setActiveIndex(nextIndex);
      onMaterialSelect?.(materials[nextIndex]);
    } else {
      // If at the beginning of the current page, go to previous page
      if (activeIndex === 0) {
        if (page > 1) {
          handlePageChange(page - 1);
          // Select last item on previous page after it loads
          setTimeout(() => {
            if (materials.length > 0) {
              setActiveIndex(materials.length - 1);
              onMaterialSelect?.(materials[materials.length - 1]);
            }
          }, 500);
        }
        return;
      }

      // Otherwise select previous item
      const prevIndex = activeIndex - 1;
      setActiveIndex(prevIndex);
      onMaterialSelect?.(materials[prevIndex]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Materials</h2>

        {!isStudentView && (
          <div className="flex space-x-2">
            <button
              onClick={handleSyncAll}
              disabled={syncingAll}
              className="flex items-center px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50"
              title="Generate AI names for documents and clean up empty entries"
            >
              {syncingAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-1.5" />
                  Generate AI Names
                </>
              )}
            </button>
            <button
              onClick={() => fetchMaterials(page)}
              className="p-2 text-blue-500 hover:bg-blue-50 rounded-full"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}

        {isStudentView && (
          <button
            onClick={() => fetchMaterials(page)}
            className="p-2 text-blue-500 hover:bg-blue-50 rounded-full"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Sync Results Display */}
      {!isStudentView && syncResults && (
        <div className="bg-purple-50 border border-purple-200 rounded-md p-4 text-sm mb-4">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-medium text-purple-800 text-base">Sync Results</h3>
            <button
              onClick={() => setSyncResults(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
              title="Dismiss"
            >
              ✕
            </button>
          </div>

          <p className="text-purple-700 mb-3">{syncResults.summary}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-white p-2 rounded shadow-sm">
              <div className="text-lg font-semibold text-purple-700">{syncResults.total}</div>
              <div className="text-xs text-gray-500">Total Documents</div>
            </div>
            <div className="bg-white p-2 rounded shadow-sm">
              <div className="text-lg font-semibold text-green-600">{syncResults.named}</div>
              <div className="text-xs text-gray-500">Named</div>
            </div>
            <div className="bg-white p-2 rounded shadow-sm">
              <div className="text-lg font-semibold text-red-600">{syncResults.deleted}</div>
              <div className="text-xs text-gray-500">Deleted</div>
            </div>
            <div className="bg-white p-2 rounded shadow-sm">
              <div className="text-lg font-semibold text-orange-600">{syncResults.errors}</div>
              <div className="text-xs text-gray-500">Errors</div>
            </div>
          </div>

          {syncResults.named > 0 && syncResults.named_keys && syncResults.named_keys.length > 0 && (
            <div className="mb-3">
              <h4 className="font-medium text-green-700 mb-1">Named Documents</h4>
              <div className="max-h-32 overflow-y-auto bg-white rounded p-2">
                {syncResults.named_keys.map((item: SyncResultsNamedKey, index: number) => (
                  <div key={`named-${item.key}-${index}`} className="text-xs mb-1 pb-1 border-b border-gray-100">
                    <span className="font-medium text-green-600">{item.name}</span>
                    <span className="mx-1">←</span>
                    <span className="text-gray-600 italic">{item.preview}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {syncResults.deleted > 0 && syncResults.deleted_keys && syncResults.deleted_keys.length > 0 && (
            <div>
              <h4 className="font-medium text-red-700 mb-1">Deleted Documents</h4>
              <div className="max-h-24 overflow-y-auto bg-white rounded p-2">
                {syncResults.deleted_keys.map((item: SyncResultsDeletedKey, index: number) => (
                  <div key={`deleted-${item.key}-${index}`} className="text-xs mb-1">
                    <span className="text-gray-600">{item.key.split(':').pop()}</span>
                    <span className="mx-1">→</span>
                    <span className="text-red-500 italic">{item.content || "<empty>"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {syncResults.errors > 0 && (
            <div className="mt-3 p-2 bg-orange-50 border border-orange-200 rounded">
              <p className="text-xs text-orange-700">
                {syncResults.errors} errors occurred during processing. This usually happens when the AI
                name generator fails to generate names for some documents. You can try again later or
                manually name individual documents.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Document Navigation Controls */}
      <div className="flex items-center justify-center space-x-4 my-4">
        <button
          onClick={() => navigateDocuments('prev')}
          disabled={loading || (activeIndex === 0 && page === 1)}
          className="p-2 border rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Previous Document"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-sm text-gray-600">
          {activeIndex !== null && materials.length > 0
            ? `${activeIndex + 1} of ${materials.length} (Page ${page} of ${totalPages})`
            : `Page ${page} of ${totalPages}`
          }
        </span>

        <button
          onClick={() => navigateDocuments('next')}
          disabled={loading || (activeIndex === materials.length - 1 && page === totalPages)}
          className="p-2 border rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Next Document"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      ) : materials.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No materials found. Upload a PDF to get started.
        </div>
      ) : (
        <>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {materials.map((material, index) => (
              <div
                key={`material-${material.key || material.timestamp}-${index}`}
                className={`p-4 border rounded hover:bg-gray-50 cursor-pointer transition-colors ${
                  index === activeIndex ? 'border-blue-500 bg-blue-50' : ''
                }`}
                onClick={() => {
                  if (!deleteConfirmKey) {
                    setActiveIndex(index);
                    if (onMaterialSelect) onMaterialSelect(material);
                  }
                }}
              >
                {!isStudentView && deleteConfirmKey === material.key && (
                  <div className="p-3 bg-red-50 rounded mb-2">
                    <p className="text-sm text-red-700 mb-2">Are you sure you want to delete this document?</p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setDeleteConfirmKey(null)}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDeleteMaterial(material.key!)}
                        disabled={deletingKey === material.key}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center"
                      >
                        {deletingKey === material.key ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          'Delete'
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className="flex justify-between items-center"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent event bubbling
                    if (!deleteConfirmKey) {
                      setActiveIndex(index);
                      if (onMaterialSelect) onMaterialSelect(material);
                    }
                  }}
                >
                  <div>
                    <h3 className="font-medium truncate">{getDisplayName(material)}</h3>
                    <div className="flex items-center text-sm text-gray-500 mt-1">
                      <Calendar className="w-3 h-3 mr-1" />
                      <span className="mr-2">{new Date(material.timestamp).toLocaleDateString()}</span>
                      <Clock className="w-3 h-3 mr-1" />
                      <span>{new Date(material.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {!isStudentView && (
                    <div className="flex space-x-1">
                      {!material.name && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            syncDocumentName(material.key!);
                          }}
                          disabled={syncingName === material.key}
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-full"
                          title="Sync AI-generated name"
                        >
                          {syncingName === material.key ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmKey(material.key!);
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-full"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Preview of document content */}
                <div
                  className="mt-2 text-xs text-gray-600 line-clamp-2 cursor-pointer"
                  onClick={() => {
                    if (!deleteConfirmKey) {
                      setActiveIndex(index);
                      if (onMaterialSelect) onMaterialSelect(material);
                    }
                  }}
                >
                  {material.text?.substring(0, 100)}...
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center space-x-2 mt-4">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1 || loading}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages || loading}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
