import type { ChangelogVersion, ChangelogItem, ChangelogSource } from '../types';

const DEFAULT_CHANGELOG_URL = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  throw lastError || new Error('Failed to fetch after retries');
}

// Fetch all available changelog sources
export async function fetchSources(): Promise<ChangelogSource[]> {
  try {
    const response = await fetch('/api/sources');
    if (!response.ok) throw new Error('Failed to fetch sources');
    return response.json();
  } catch (error) {
    console.error('Failed to fetch sources:', error);
    return [];
  }
}

// Fetch changelog from the default URL
export async function fetchChangelog(): Promise<string> {
  const response = await fetchWithRetry(DEFAULT_CHANGELOG_URL);
  return response.text();
}

// Fetch changelog from a specific source
export async function fetchChangelogFromSource(sourceId: string): Promise<{ markdown: string; source: ChangelogSource }> {
  const response = await fetch(`/api/sources/${sourceId}/changelog`);
  if (!response.ok) throw new Error('Failed to fetch changelog from source');
  return response.json();
}

// Fetch changelogs from all active sources
export async function fetchAllActiveChangelogs(): Promise<{ sourceId: string; sourceName: string; markdown: string }[]> {
  const sources = await fetchSources();
  const activeSources = sources.filter(s => s.is_active);

  const results = await Promise.allSettled(
    activeSources.map(async (source) => {
      try {
        const response = await fetch(`/api/sources/${source.id}/changelog`);
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        return {
          sourceId: source.id,
          sourceName: source.name,
          markdown: data.markdown,
        };
      } catch {
        console.error(`Failed to fetch changelog from ${source.name}`);
        return null;
      }
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<{ sourceId: string; sourceName: string; markdown: string } | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((r): r is { sourceId: string; sourceName: string; markdown: string } => r !== null);
}

export function parseChangelog(
  markdown: string,
  sourceId?: string,
  sourceName?: string
): ChangelogVersion[] {
  const versions: ChangelogVersion[] = [];
  const lines = markdown.split('\n');

  let currentVersion: ChangelogVersion | null = null;

  for (const line of lines) {
    const versionMatch = line.match(/^##\s+\[?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)\]?(?:\s*[-–]\s*(.+))?/);

    if (versionMatch) {
      if (currentVersion) {
        versions.push(currentVersion);
      }
      currentVersion = {
        version: versionMatch[1],
        date: versionMatch[2]?.trim() || '',
        items: [],
        sourceId,
        sourceName,
      };
      continue;
    }

    if (currentVersion && (line.startsWith('- ') || line.startsWith('* '))) {
      const content = line.slice(2).trim();
      const item: ChangelogItem = {
        type: categorizeItem(content),
        content,
      };
      currentVersion.items.push(item);
    }
  }

  if (currentVersion) {
    versions.push(currentVersion);
  }

  return versions;
}

function categorizeItem(content: string): ChangelogItem['type'] {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes('breaking') || lowerContent.includes('removed') && lowerContent.includes('support')) {
    return 'breaking';
  }
  if (lowerContent.includes('removed') || lowerContent.includes('deprecated') || lowerContent.includes('no longer')) {
    return 'removal';
  }
  if (lowerContent.includes('fix') || lowerContent.includes('fixed') || lowerContent.includes('bug') || lowerContent.includes('issue')) {
    return 'fix';
  }
  if (lowerContent.includes('add') || lowerContent.includes('new') || lowerContent.includes('feature') || lowerContent.includes('support')) {
    return 'feature';
  }

  return 'other';
}

export function getLatestVersion(versions: ChangelogVersion[]): string {
  return versions[0]?.version || 'Unknown';
}
