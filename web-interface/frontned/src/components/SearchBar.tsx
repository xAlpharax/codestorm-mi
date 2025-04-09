import { useState } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import axios from 'axios';

interface Material {
  text: string;
  title: string;
  timestamp: number;
  name?: string;
  key?: string;
  has_pdf?: boolean;
  score?: number;
}

interface SearchBarProps {
  onResultSelect: (material: Material | null) => void;
}

export default function SearchBar({ onResultSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await axios.post('http://10.0.12.9:5020/api/materials/search', {
        query: query.trim(),
        limit: 5
      });

      setResults(response.data.materials || []);
      setShowResults(true);
    } catch (err: any) {
      console.error('Search error:', err);
      setError('Search failed: ' + (err.message || 'Unknown error'));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center border rounded-md bg-white shadow-sm">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          onFocus={() => results.length > 0 && setShowResults(true)}
          className="flex-1 px-4 py-2 focus:outline-none text-sm rounded-l-md"
          placeholder="Search course materials..."
        />
        {query && (
          <button
            onClick={clearSearch}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4 mx-1" />
          </button>
        )}
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-r-md hover:bg-blue-600 disabled:bg-blue-300 flex items-center"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Search className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {showResults && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-80 overflow-y-auto">
          <div className="p-2 border-b text-xs text-gray-500">
            Found {results.length} results
          </div>
          {results.map((result) => (
            <div
              key={result.key}
              onClick={() => {
                onResultSelect(result);
                setShowResults(false);
              }}
              className="p-3 hover:bg-gray-50 cursor-pointer border-b"
            >
              <div className="font-medium truncate">
                {result.name || result.title || 'Unnamed Document'}
              </div>
              <div className="text-sm text-gray-500 truncate mt-1">
                {result.text.substring(0, 100)}...
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-xs text-gray-400">
                  {new Date(result.timestamp).toLocaleDateString()}
                </span>
                {result.score !== undefined && (
                  <span className="text-xs bg-blue-100 text-blue-800 rounded-full px-2 py-0.5">
                    Score: {Math.round(result.score * 100)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showResults && query && results.length === 0 && !loading && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-md p-4 text-center">
          <div className="text-gray-500">No results found</div>
        </div>
      )}
    </div>
  );
}
