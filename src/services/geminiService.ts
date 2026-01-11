import type { GeminiAnalysis } from '../types';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

const ANALYSIS_PROMPT = `You are an expert at analyzing Claude Code changelogs. Analyze the following changelog and return JSON with this exact structure:

{
  "tldr": "150-200 word summary for busy developers highlighting the most important changes",
  "categories": {
    "critical_breaking_changes": ["list of breaking changes that require immediate action"],
    "removals": [{"feature": "name", "severity": "critical|high|medium|low", "why": "reason for removal"}],
    "major_features": ["list of significant new features"],
    "important_fixes": ["list of notable bug fixes"],
    "new_slash_commands": ["list of new slash commands if any"],
    "terminal_improvements": ["list of terminal/CLI improvements"],
    "api_changes": ["list of API-related changes"]
  },
  "action_items": ["specific actions developers should take based on these changes"],
  "sentiment": "positive|neutral|critical"
}

Be thorough but concise. Focus on what developers need to know to update their workflows.

Changelog to analyze:
`;

export async function analyzeChangelog(changelogText: string): Promise<GeminiAnalysis> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: ANALYSIS_PROMPT + changelogText,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 1.0,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini API');
  }

  try {
    return JSON.parse(text) as GeminiAnalysis;
  } catch {
    throw new Error('Failed to parse Gemini response as JSON');
  }
}
