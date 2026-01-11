import type { GeminiAnalysis } from '../types';

// Analysis cache - uses SQLite via API
export async function getCachedAnalysis(versionHash: string): Promise<GeminiAnalysis | null> {
  try {
    const response = await fetch(`/api/analysis/${versionHash}`);
    if (!response.ok) return null;

    const data = await response.json();
    return data.analysis;
  } catch {
    return null;
  }
}

export async function setCachedAnalysis(versionHash: string, analysis: GeminiAnalysis): Promise<void> {
  try {
    await fetch(`/api/analysis/${versionHash}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis }),
    });
  } catch (error) {
    console.error('Failed to cache analysis:', error);
  }
}

// Legacy functions for backward compatibility - audio is now handled by ttsService directly
export async function getCachedAudio(_textHash: string): Promise<ArrayBuffer | null> {
  // Audio caching is now handled by ttsService via /api/audio endpoints
  return null;
}

export async function setCachedAudio(_textHash: string, _audio: ArrayBuffer): Promise<void> {
  // Audio caching is now handled by ttsService via /api/audio endpoints
}

export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
