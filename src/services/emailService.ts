import type { GeminiAnalysis } from '../types';

interface SendEmailParams {
  version: string;
  tldr: string;
  analysis: GeminiAnalysis;
}

export async function sendChangelogEmail({ version, tldr, analysis }: SendEmailParams): Promise<boolean> {
  try {
    const response = await fetch('/api/send-changelog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version,
        tldr,
        categories: analysis.categories,
        action_items: analysis.action_items,
        sentiment: analysis.sentiment,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send email');
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}
