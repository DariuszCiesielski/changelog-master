import { useState, useEffect, useCallback } from 'react';
import type { ChangelogVersion, GeminiAnalysis, ChangelogSource } from '../types';
import {
  fetchChangelog,
  fetchSources,
  fetchChangelogFromSource,
  parseChangelog,
  getLatestVersion,
} from '../services/changelogService';
import { analyzeChangelog } from '../services/geminiService';
import { getCachedAnalysis, setCachedAnalysis, hashString } from '../services/cacheService';

interface UseChangelogReturn {
  rawChangelog: string | null;
  parsedChangelog: ChangelogVersion[];
  analysis: GeminiAnalysis | null;
  latestVersion: string;
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string | null;
  lastFetched: number | null;
  sources: ChangelogSource[];
  selectedSourceId: string | null;
  selectedSourceName: string;
  refresh: () => Promise<void>;
  selectSource: (sourceId: string | null) => void;
}

export function useChangelog(): UseChangelogReturn {
  const [rawChangelog, setRawChangelog] = useState<string | null>(null);
  const [parsedChangelog, setParsedChangelog] = useState<ChangelogVersion[]>([]);
  const [analysis, setAnalysis] = useState<GeminiAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [sources, setSources] = useState<ChangelogSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(() => {
    return localStorage.getItem('selectedSourceId');
  });

  // Load available sources on mount
  useEffect(() => {
    fetchSources().then(setSources);
  }, []);

  const loadChangelog = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let markdown: string;
      let sourceId: string | undefined;
      let sourceName: string | undefined;

      if (selectedSourceId) {
        // Fetch from specific source
        const result = await fetchChangelogFromSource(selectedSourceId);
        markdown = result.markdown;
        sourceId = result.source.id;
        sourceName = result.source.name;
      } else {
        // Fetch from default URL
        markdown = await fetchChangelog();
        sourceName = 'Claude Code';
      }

      setRawChangelog(markdown);

      const versions = parseChangelog(markdown, sourceId, sourceName);
      setParsedChangelog(versions);
      setLastFetched(Date.now());

      const latestVersionText = versions.slice(0, 3).map((v) =>
        `## ${v.version}\n${v.items.map((i) => `- ${i.content}`).join('\n')}`
      ).join('\n\n');

      const versionHash = hashString(latestVersionText);

      const cached = await getCachedAnalysis(versionHash);
      if (cached) {
        setAnalysis(cached);
      } else {
        setIsAnalyzing(true);
        try {
          const result = await analyzeChangelog(latestVersionText);
          setAnalysis(result);
          await setCachedAnalysis(versionHash, result);
        } catch (analysisError) {
          console.error('Analysis failed:', analysisError);
        } finally {
          setIsAnalyzing(false);
        }
      }

      // Refresh sources list
      const updatedSources = await fetchSources();
      setSources(updatedSources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load changelog');
    } finally {
      setIsLoading(false);
    }
  }, [selectedSourceId]);

  useEffect(() => {
    loadChangelog();
  }, [loadChangelog]);

  const selectSource = useCallback((sourceId: string | null) => {
    setSelectedSourceId(sourceId);
    if (sourceId) {
      localStorage.setItem('selectedSourceId', sourceId);
    } else {
      localStorage.removeItem('selectedSourceId');
    }
  }, []);

  const latestVersion = getLatestVersion(parsedChangelog);
  const selectedSourceName = sources.find(s => s.id === selectedSourceId)?.name || 'Claude Code';

  return {
    rawChangelog,
    parsedChangelog,
    analysis,
    latestVersion,
    isLoading,
    isAnalyzing,
    error,
    lastFetched,
    sources,
    selectedSourceId,
    selectedSourceName,
    refresh: loadChangelog,
    selectSource,
  };
}
