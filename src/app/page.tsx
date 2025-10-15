'use client';

import { useState } from 'react';

interface AIResponse {
  success: boolean;
  query: string;
  response: string;
  toolsUsed?: string[];
  model?: string;
  error?: string;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResponse | null>(null);
  const [workerUrl, setWorkerUrl] = useState('https://cloudflare-ai-toolcalling.search-engine.workers.dev');

  const exampleQueries = [
    { label: 'Weather in Bangalore', query: 'What is the current weather in London?' },
    { label: 'Weather in Chittoor', query: 'Tell me the weather in Tokyo, Japan' },
    { label: 'Weather in New York', query: 'How is the weather in New York?' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${workerUrl}?query=${encodeURIComponent(query)}`);
      const data: AIResponse = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        query: query,
        response: '',
        error: error instanceof Error ? error.message : 'Failed to connect to Worker',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (exampleQuery: string) => {
    setQuery(exampleQuery);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">
            Cloudflare Workers AI Weather
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            AI-powered weather assistant using Cloudflare Workers AI + Secrets Store
          </p>
        </div>


        {/* Query Form */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Your Question:
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about the weather in any city..."
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-lg font-medium hover:from-orange-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? 'Asking...' : 'Ask AI'}
              </button>
            </div>
          </div>
        </form>

          {/* Example Queries */}
          <div className="mb-6">
              <div className="flex flex-wrap gap-5">
                  {exampleQueries.map((example, idx) => (
                      <button
                          key={idx}
                          onClick={() => handleExampleClick(example.query)}
                          className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                          {example.label}
                      </button>
                  ))}
              </div>
          </div>


        {/* Loading State */}
        {loading && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              <span className="ml-3 text-gray-600 dark:text-gray-400">Processing with AI...</span>
            </div>
          </div>
        )}

        {/* Result Display */}
        {result && !loading && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            {result.success ? (
              <>
                <div className="flex items-start mb-4">
                  <div className="flex-shrink-0 bg-green-100 dark:bg-green-900 rounded-full p-2 mr-3">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">AI Response</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Query: {result.query}</p>
                  </div>
                </div>
                {result.toolsUsed && result.toolsUsed.length > 0 && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Tools Used:</span>
                    {result.toolsUsed.map((tool, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                      >
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                        </svg>
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono">
                    {result.response}
                  </pre>
                </div>
                {result.model && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    Model: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">{result.model}</code>
                  </p>
                )}
              </>
            ) : (
              <div className="flex items-start">
                <div className="flex-shrink-0 bg-red-100 dark:bg-red-900 rounded-full p-2 mr-3">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-red-800 dark:text-red-400 mb-1">Error</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{result.error}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
          <h3 className="font-semibold mb-2 text-blue-900 dark:text-blue-300">How it works:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-400">
            <li>AI analyzes your weather query</li>
            <li>Calls <code className="bg-blue-100 dark:bg-blue-800 px-1 py-0.5 rounded">getCurrentWeather</code> tool with city information</li>
            <li>Retrieves API key from Cloudflare Secrets Store securely</li>
            <li>Fetches real-time weather data from OpenWeatherMap API</li>
            <li>AI generates a natural language response with weather details</li>
          </ol>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Built with Cloudflare Workers AI + Secrets Store + Next.js</p>
          <p className="mt-1">Powered by OpenWeatherMap API</p>
        </div>
      </div>
    </div>
  );
}
