import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';
import cron, { ScheduledTask } from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Default source URL (used for seeding)
const DEFAULT_CHANGELOG_URL = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;

// Initialize Turso database
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Create tables
async function initDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audio_cache (
      id TEXT PRIMARY KEY,
      text_hash TEXT NOT NULL,
      voice TEXT NOT NULL,
      audio_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_audio_hash_voice ON audio_cache(text_hash, voice)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS changelog_history (
      version TEXT PRIMARY KEY,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notified INTEGER DEFAULT 0,
      source_id TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      selected_versions TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS analysis_cache (
      version TEXT PRIMARY KEY,
      analysis_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS changelog_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      is_active INTEGER DEFAULT 1,
      last_version TEXT,
      last_checked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_changelog_sources_active ON changelog_sources(is_active)`);

  // Seed default source if none exists
  const result = await db.execute('SELECT COUNT(*) as count FROM changelog_sources');
  const count = result.rows[0]?.count as number;
  if (count === 0) {
    await db.execute({
      sql: 'INSERT INTO changelog_sources (id, name, url, is_active) VALUES (?, ?, ?, 1)',
      args: ['src_claude_code', 'Claude Code', DEFAULT_CHANGELOG_URL],
    });
  }
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============ Changelog Monitoring ============

let cronJob: ScheduledTask | null = null;
let currentCronExpression: string | null = null;

// Convert milliseconds interval to cron expression
function intervalToCron(intervalMs: number): string | null {
  const minutes = intervalMs / 60000;

  if (minutes <= 0) return null;
  if (minutes === 1) return '* * * * *';
  if (minutes === 5) return '*/5 * * * *';
  if (minutes === 15) return '*/15 * * * *';
  if (minutes === 30) return '*/30 * * * *';
  if (minutes === 60) return '0 * * * *';
  if (minutes === 360) return '0 */6 * * *';
  if (minutes === 720) return '0 */12 * * *';
  if (minutes === 1440) return '0 0 * * *';
  if (minutes === 10080) return '0 0 * * 0';
  if (minutes === 20160) return '0 0 1,15 * *';

  return `*/${Math.max(1, Math.round(minutes))} * * * *`;
}

interface ChangelogSource {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  last_version: string | null;
  last_checked_at: string | null;
}

async function getActiveSources(): Promise<ChangelogSource[]> {
  const result = await db.execute('SELECT * FROM changelog_sources WHERE is_active = 1');
  return result.rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    url: row.url as string,
    is_active: Boolean(row.is_active),
    last_version: row.last_version as string | null,
    last_checked_at: row.last_checked_at as string | null,
  }));
}

async function getAllSources(): Promise<ChangelogSource[]> {
  const result = await db.execute('SELECT * FROM changelog_sources ORDER BY created_at ASC');
  return result.rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    url: row.url as string,
    is_active: Boolean(row.is_active),
    last_version: row.last_version as string | null,
    last_checked_at: row.last_checked_at as string | null,
  }));
}

async function getLastKnownVersion(sourceId?: string): Promise<string | null> {
  if (sourceId) {
    const result = await db.execute({
      sql: 'SELECT version FROM changelog_history WHERE source_id = ? ORDER BY detected_at DESC LIMIT 1',
      args: [sourceId],
    });
    return (result.rows[0]?.version as string) ?? null;
  }
  const result = await db.execute('SELECT version FROM changelog_history ORDER BY detected_at DESC LIMIT 1');
  return (result.rows[0]?.version as string) ?? null;
}

async function saveVersion(version: string, sourceId: string): Promise<void> {
  await db.execute({
    sql: 'INSERT OR IGNORE INTO changelog_history (version, source_id) VALUES (?, ?)',
    args: [version, sourceId],
  });
  await db.execute({
    sql: 'UPDATE changelog_sources SET last_version = ?, last_checked_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [version, sourceId],
  });
}

async function markVersionNotified(version: string, sourceId: string): Promise<void> {
  await db.execute({
    sql: 'UPDATE changelog_history SET notified = 1 WHERE version = ? AND source_id = ?',
    args: [version, sourceId],
  });
}

async function fetchChangelog(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch changelog: ${response.status}`);
  return response.text();
}

function parseLatestVersion(markdown: string): { version: string; content: string; date: string } | null {
  const lines = markdown.split('\n');
  let version = '';
  let date = '';
  let content: string[] = [];
  let capturing = false;

  for (const line of lines) {
    // Support both ## [version] and # [version] formats (n8n uses single #)
    const versionMatch = line.match(/^#{1,2}\s+\[?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)\]?/);
    if (versionMatch) {
      if (capturing) break;
      version = versionMatch[1];

      // Extract date - try multiple formats:
      // 1. n8n format: # [2.3.0](url) (2026-01-05) - date in parentheses at the end
      // 2. Claude format: ## 1.0.50 - 2024-01-12 - date after dash
      const dateInParensMatch = line.match(/\((\d{4}-\d{2}-\d{2})\)\s*$/);
      if (dateInParensMatch) {
        date = dateInParensMatch[1];
      } else {
        const dateAfterDashMatch = line.match(/[-–]\s*(\d{4}-\d{2}-\d{2}|\w+\s+\d+,?\s*\d{4})/);
        if (dateAfterDashMatch) {
          date = dateAfterDashMatch[1].trim();
        }
      }

      capturing = true;
      content.push(line);
    } else if (capturing) {
      content.push(line);
    }
  }

  return version ? { version, content: content.join('\n'), date } : null;
}

interface ChangelogEmailRequest {
  version: string;
  tldr: string;
  categories: {
    critical_breaking_changes: string[];
    removals: { feature: string; severity: string; why: string }[];
    major_features: string[];
    important_fixes: string[];
    new_slash_commands: string[];
    terminal_improvements: string[];
    api_changes: string[];
  };
  action_items: string[];
  sentiment: string;
}

async function analyzeChangelog(changelogText: string): Promise<ChangelogEmailRequest | null> {
  if (!GEMINI_API_KEY) return null;

  const prompt = `Analyze this changelog and return JSON:
{
  "tldr": "150-200 word summary",
  "categories": {
    "critical_breaking_changes": [],
    "removals": [{"feature": "", "severity": "", "why": ""}],
    "major_features": [],
    "important_fixes": [],
    "new_slash_commands": [],
    "terminal_improvements": [],
    "api_changes": []
  },
  "action_items": [],
  "sentiment": "positive|neutral|critical"
}

Changelog:
${changelogText}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  if (!response.ok) return null;

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  }
}

async function generateTTSAudio(text: string, voice: string = 'Charon'): Promise<Buffer | null> {
  if (!GEMINI_API_KEY) return null;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Read this changelog summary:\n\n${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    }
  );

  if (!response.ok) return null;

  const data = await response.json();
  const base64Audio = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) return null;

  const pcmBuffer = Buffer.from(base64Audio, 'base64');
  return pcmToWav(pcmBuffer);
}

function pcmToWav(pcmData: Buffer): Buffer {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;

  const buffer = Buffer.alloc(headerSize + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  pcmData.copy(buffer, headerSize);

  return buffer;
}

async function sendEmailWithAttachment(
  data: ChangelogEmailRequest,
  audioBuffer: Buffer | null
): Promise<boolean> {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) return false;

  const html = generateEmailHtml(data);

  const emailPayload: Record<string, unknown> = {
    from: 'Changelog Tracker <onboarding@resend.dev>',
    to: [NOTIFY_EMAIL],
    subject: `🆕 Claude Code ${data.version} Released`,
    html,
  };

  if (audioBuffer) {
    emailPayload.attachments = [
      {
        filename: `claude-code-${data.version}-summary.wav`,
        content: audioBuffer.toString('base64'),
      },
    ];
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  });

  return response.ok;
}

async function checkSourceForNewChangelog(source: ChangelogSource): Promise<void> {
  try {
    console.log(`[Monitor] Checking source: ${source.name} (${source.url})`);

    const markdown = await fetchChangelog(source.url);
    const latest = parseLatestVersion(markdown);

    if (!latest) {
      console.log(`[Monitor] Could not parse changelog for ${source.name}`);
      return;
    }

    const lastKnown = await getLastKnownVersion(source.id);
    console.log(`[Monitor] ${source.name}: Latest: ${latest.version}, Last known: ${lastKnown}`);

    const notifyEnabledResult = await db.execute({
      sql: 'SELECT value FROM settings WHERE key = ?',
      args: ['emailNotificationsEnabled'],
    });
    const alwaysSendEmailResult = await db.execute({
      sql: 'SELECT value FROM settings WHERE key = ?',
      args: ['alwaysSendEmail'],
    });

    const notifyEnabled = notifyEnabledResult.rows[0]?.value as string | undefined;
    const alwaysSendEmail = alwaysSendEmailResult.rows[0]?.value as string | undefined;

    if (notifyEnabled !== 'true') {
      console.log(`[Monitor] Email notifications disabled for ${source.name}, skipping`);
      if (lastKnown !== latest.version) {
        await saveVersion(latest.version, source.id);
      }
      return;
    }

    const isNewVersion = lastKnown !== latest.version;
    const shouldSendEmail = isNewVersion || alwaysSendEmail === 'true';

    if (!shouldSendEmail) {
      console.log(`[Monitor] ${source.name}: No new version and always-send disabled`);
      return;
    }

    if (isNewVersion) {
      console.log(`[Monitor] ${source.name}: New version detected: ${latest.version}`);
      await saveVersion(latest.version, source.id);
    } else {
      console.log(`[Monitor] ${source.name}: Sending scheduled email for current version`);
    }

    console.log(`[Monitor] Analyzing changelog for ${source.name}...`);
    const analysis = await analyzeChangelog(latest.content);

    if (!analysis) {
      console.log(`[Monitor] Failed to analyze changelog for ${source.name}`);
      return;
    }

    analysis.version = `${source.name} ${latest.version}`;

    console.log(`[Monitor] Generating audio for ${source.name}...`);
    const voiceSettingResult = await db.execute({
      sql: 'SELECT value FROM settings WHERE key = ?',
      args: ['notificationVoice'],
    });
    const voice = (voiceSettingResult.rows[0]?.value as string) || 'Charon';
    const audioBuffer = await generateTTSAudio(analysis.tldr, voice);

    console.log(`[Monitor] Sending notification email for ${source.name}...`);
    const sent = await sendEmailWithAttachment(analysis, audioBuffer);

    if (sent) {
      await markVersionNotified(latest.version, source.id);
      console.log(`[Monitor] Notification sent for ${source.name} ${latest.version}`);
    } else {
      console.log(`[Monitor] Failed to send notification for ${source.name}`);
    }
  } catch (error) {
    console.error(`[Monitor] Error checking ${source.name}:`, error);
  }
}

async function checkForNewChangelog(): Promise<void> {
  console.log('[Monitor] Starting changelog check for all active sources...');

  const sources = await getActiveSources();

  if (sources.length === 0) {
    console.log('[Monitor] No active sources configured');
    return;
  }

  console.log(`[Monitor] Checking ${sources.length} source(s)`);

  for (const source of sources) {
    await checkSourceForNewChangelog(source);
  }

  console.log('[Monitor] Finished checking all sources');
}

function startMonitoring(intervalMs: number): void {
  stopMonitoring();

  const cronExpression = intervalToCron(intervalMs);

  if (!cronExpression) {
    console.log('[Monitor] Monitoring disabled (no valid interval)');
    return;
  }

  console.log(`[Monitor] Starting cron job: "${cronExpression}" (every ${intervalMs / 60000} minutes)`);
  currentCronExpression = cronExpression;

  checkForNewChangelog();

  cronJob = cron.schedule(cronExpression, () => {
    console.log(`[Cron] Running scheduled check at ${new Date().toISOString()}`);
    checkForNewChangelog();
  });

  console.log('[Monitor] Cron job started successfully');
}

function stopMonitoring(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    currentCronExpression = null;
    console.log('[Monitor] Cron job stopped');
  }
}

// ============ Express Routes ============

// Audio cache endpoints
app.get('/api/audio/:textHash/:voice', async (req, res) => {
  const { textHash, voice } = req.params;

  const result = await db.execute({
    sql: 'SELECT audio_data FROM audio_cache WHERE text_hash = ? AND voice = ?',
    args: [textHash, voice],
  });

  if (result.rows.length > 0) {
    const audioData = result.rows[0].audio_data as string;
    res.set('Content-Type', 'audio/wav');
    res.send(Buffer.from(audioData, 'base64'));
  } else {
    res.status(404).json({ error: 'Audio not found' });
  }
});

app.post('/api/audio', async (req, res) => {
  const { textHash, voice, audioData } = req.body;

  if (!textHash || !voice || !audioData) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const id = `${textHash}_${voice}_${Date.now()}`;

    await db.execute({
      sql: 'INSERT OR REPLACE INTO audio_cache (id, text_hash, voice, audio_data) VALUES (?, ?, ?, ?)',
      args: [id, textHash, voice, audioData],
    });

    res.json({ success: true, id });
  } catch (error) {
    console.error('Failed to save audio:', error);
    res.status(500).json({ error: 'Failed to save audio' });
  }
});

app.get('/api/audio/list', async (_req, res) => {
  const result = await db.execute(`
    SELECT id, text_hash, voice, created_at, LENGTH(audio_data) as size
    FROM audio_cache
    ORDER BY created_at DESC
  `);
  res.json(result.rows);
});

app.delete('/api/audio/:id', async (req, res) => {
  const { id } = req.params;
  await db.execute({
    sql: 'DELETE FROM audio_cache WHERE id = ?',
    args: [id],
  });
  res.json({ success: true });
});

// Settings endpoints
app.get('/api/settings/:key', async (req, res) => {
  const { key } = req.params;
  const result = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: [key],
  });
  res.json({ value: (result.rows[0]?.value as string) ?? null });
});

app.post('/api/settings/:key', async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  await db.execute({
    sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    args: [key, value],
  });

  if (key === 'emailNotificationsEnabled' || key === 'notificationCheckInterval') {
    const enabledResult = await db.execute({
      sql: 'SELECT value FROM settings WHERE key = ?',
      args: ['emailNotificationsEnabled'],
    });
    const intervalResult = await db.execute({
      sql: 'SELECT value FROM settings WHERE key = ?',
      args: ['notificationCheckInterval'],
    });

    const enabled = enabledResult.rows[0]?.value === 'true';
    const interval = parseInt((intervalResult.rows[0]?.value as string) || '0') || 0;

    if (enabled && interval > 0) {
      startMonitoring(interval);
    } else {
      stopMonitoring();
    }
  }

  res.json({ success: true });
});

app.get('/api/settings', async (_req, res) => {
  const result = await db.execute('SELECT key, value FROM settings');
  const settings: Record<string, string> = {};
  result.rows.forEach((row) => {
    settings[row.key as string] = row.value as string;
  });
  res.json(settings);
});

// Monitoring endpoints
app.post('/api/monitor/check', async (_req, res) => {
  await checkForNewChangelog();
  res.json({ success: true });
});

// Send demo email with audio attachment on demand
app.post('/api/send-demo-email', async (req, res) => {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    res.status(500).json({ success: false, error: 'Email configuration missing' });
    return;
  }

  try {
    const { voice = 'Charon', sourceId } = req.body;

    let sourceUrl = DEFAULT_CHANGELOG_URL;
    let sourceName = 'Claude Code';

    if (sourceId) {
      const result = await db.execute({
        sql: 'SELECT * FROM changelog_sources WHERE id = ?',
        args: [sourceId],
      });
      if (result.rows.length > 0) {
        sourceUrl = result.rows[0].url as string;
        sourceName = result.rows[0].name as string;
      }
    } else {
      const sources = await getActiveSources();
      if (sources.length > 0) {
        sourceUrl = sources[0].url;
        sourceName = sources[0].name;
      }
    }

    console.log(`[Demo] Fetching changelog from ${sourceName}...`);
    const markdown = await fetchChangelog(sourceUrl);
    const latest = parseLatestVersion(markdown);

    if (!latest) {
      res.status(500).json({ success: false, error: 'Could not parse changelog' });
      return;
    }

    console.log(`[Demo] Analyzing ${sourceName} version ${latest.version}...`);
    const analysis = await analyzeChangelog(latest.content);

    if (!analysis) {
      res.status(500).json({ success: false, error: 'Failed to analyze changelog' });
      return;
    }

    analysis.version = `${sourceName} ${latest.version}`;

    console.log('[Demo] Generating audio...');
    const audioBuffer = await generateTTSAudio(analysis.tldr, voice);

    console.log('[Demo] Sending email with attachment...');
    const sent = await sendEmailWithAttachment(analysis, audioBuffer);

    if (sent) {
      console.log('[Demo] Demo email sent successfully!');
      res.json({ success: true, version: latest.version });
    } else {
      res.status(500).json({ success: false, error: 'Failed to send email' });
    }
  } catch (error) {
    console.error('[Demo] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to send demo email' });
  }
});

app.get('/api/monitor/status', async (_req, res) => {
  const enabledResult = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: ['emailNotificationsEnabled'],
  });
  const intervalResult = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: ['notificationCheckInterval'],
  });
  const lastVersion = await getLastKnownVersion();

  res.json({
    enabled: enabledResult.rows[0]?.value === 'true',
    interval: parseInt((intervalResult.rows[0]?.value as string) || '0') || 0,
    lastKnownVersion: lastVersion,
    isRunning: cronJob !== null,
    cronExpression: currentCronExpression,
  });
});

app.get('/api/monitor/history', async (_req, res) => {
  const result = await db.execute(
    'SELECT version, detected_at, notified, source_id FROM changelog_history ORDER BY detected_at DESC LIMIT 20'
  );
  res.json(result.rows);
});

// ============ Changelog Sources Endpoints ============

app.get('/api/sources', async (_req, res) => {
  const sources = await getAllSources();
  res.json(sources);
});

app.get('/api/sources/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.execute({
    sql: 'SELECT * FROM changelog_sources WHERE id = ?',
    args: [id],
  });

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }

  res.json(result.rows[0]);
});

app.post('/api/sources', async (req, res) => {
  const { name, url } = req.body;

  if (!name || !url) {
    res.status(400).json({ error: 'Name and URL are required' });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL format' });
    return;
  }

  const id = `src_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    await db.execute({
      sql: 'INSERT INTO changelog_sources (id, name, url, is_active) VALUES (?, ?, ?, 1)',
      args: [id, name, url],
    });

    res.json({ id, name, url, is_active: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT') {
      res.status(409).json({ error: 'A source with this URL already exists' });
    } else {
      console.error('Failed to create source:', error);
      res.status(500).json({ error: 'Failed to create source' });
    }
  }
});

app.patch('/api/sources/:id', async (req, res) => {
  const { id } = req.params;
  const { name, url, is_active } = req.body;

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }

  if (url !== undefined) {
    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid URL format' });
      return;
    }
    updates.push('url = ?');
    values.push(url);
  }

  if (is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No updates provided' });
    return;
  }

  values.push(id);

  try {
    const result = await db.execute({
      sql: `UPDATE changelog_sources SET ${updates.join(', ')} WHERE id = ?`,
      args: values,
    });

    if (result.rowsAffected === 0) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    res.json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT') {
      res.status(409).json({ error: 'A source with this URL already exists' });
    } else {
      console.error('Failed to update source:', error);
      res.status(500).json({ error: 'Failed to update source' });
    }
  }
});

app.delete('/api/sources/:id', async (req, res) => {
  const { id } = req.params;

  await db.execute({
    sql: 'DELETE FROM changelog_history WHERE source_id = ?',
    args: [id],
  });

  const result = await db.execute({
    sql: 'DELETE FROM changelog_sources WHERE id = ?',
    args: [id],
  });

  if (result.rowsAffected === 0) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }

  res.json({ success: true });
});

app.get('/api/sources/:id/changelog', async (req, res) => {
  const { id } = req.params;
  const result = await db.execute({
    sql: 'SELECT * FROM changelog_sources WHERE id = ?',
    args: [id],
  });

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }

  const source = result.rows[0];

  try {
    const markdown = await fetchChangelog(source.url as string);
    res.json({ markdown, source });
  } catch (error) {
    console.error(`Failed to fetch changelog for ${source.name}:`, error);
    res.status(500).json({ error: 'Failed to fetch changelog' });
  }
});

app.post('/api/sources/test', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL format' });
    return;
  }

  try {
    const markdown = await fetchChangelog(url);
    const latest = parseLatestVersion(markdown);

    if (!latest) {
      res.json({
        valid: false,
        message: 'Could not parse version from this URL. Make sure it contains markdown with version headers like "## 1.0.0"',
      });
      return;
    }

    res.json({
      valid: true,
      latestVersion: latest.version,
      preview: latest.content.slice(0, 500) + (latest.content.length > 500 ? '...' : ''),
    });
  } catch (error) {
    res.json({
      valid: false,
      message: `Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  if (!GEMINI_API_KEY) {
    res.status(500).json({ error: 'Gemini API key not configured' });
    return;
  }

  try {
    const { message, context, history = [], language = 'en' } = req.body;

    const languageInstruction = language === 'pl'
      ? '\n\nIMPORTANT: You MUST respond entirely in Polish language. All your responses must be in Polish.'
      : '';

    const systemPrompt = `You are a helpful assistant that answers questions about Claude Code changelog releases.
You have access to specific changelog versions that the user has selected.
Be concise but thorough. Use bullet points for lists.
If the user asks about something not in the provided context, say so.
Focus on practical implications for developers.

IMPORTANT FORMATTING RULES:
- NEVER use em dashes (—) or en dashes (–). Use regular hyphens (-) or colons (:) instead.
- Keep responses clean and readable.${languageInstruction}`;

    const contextSection = context
      ? `\n\n## Selected Changelog Versions:\n${context}\n\n---\n`
      : '\n\n(No specific versions selected - answering based on general knowledge)\n\n';

    const contents = [
      ...history.map((msg: { role: string; content: string }) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt + contextSection }],
          },
          contents,
          generationConfig: {
            temperature: 1.0,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API error:', error);
      res.status(500).json({ error: 'Failed to get response from Gemini' });
      return;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      res.status(500).json({ error: 'No response from Gemini' });
      return;
    }

    res.json({ response: text });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Chat request failed' });
  }
});

// ============ Chat Persistence Endpoints ============

app.get('/api/conversations', async (_req, res) => {
  const result = await db.execute(`
    SELECT c.id, c.title, c.created_at, c.updated_at,
           (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) as message_count
    FROM chat_conversations c
    ORDER BY c.updated_at DESC
  `);
  res.json(result.rows);
});

app.get('/api/conversations/:id', async (req, res) => {
  const { id } = req.params;

  const convResult = await db.execute({
    sql: 'SELECT * FROM chat_conversations WHERE id = ?',
    args: [id],
  });

  if (convResult.rows.length === 0) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const msgResult = await db.execute({
    sql: 'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC',
    args: [id],
  });

  res.json({ ...convResult.rows[0], messages: msgResult.rows });
});

app.post('/api/conversations', async (req, res) => {
  const { title } = req.body;
  const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.execute({
    sql: 'INSERT INTO chat_conversations (id, title) VALUES (?, ?)',
    args: [id, title || 'New Conversation'],
  });

  res.json({ id, title: title || 'New Conversation' });
});

app.patch('/api/conversations/:id', async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;

  await db.execute({
    sql: 'UPDATE chat_conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [title, id],
  });

  res.json({ success: true });
});

app.delete('/api/conversations/:id', async (req, res) => {
  const { id } = req.params;

  await db.execute({
    sql: 'DELETE FROM chat_messages WHERE conversation_id = ?',
    args: [id],
  });
  await db.execute({
    sql: 'DELETE FROM chat_conversations WHERE id = ?',
    args: [id],
  });

  res.json({ success: true });
});

app.post('/api/conversations/:id/messages', async (req, res) => {
  const { id: conversationId } = req.params;
  const { role, content, selectedVersions } = req.body;

  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.execute({
    sql: 'INSERT INTO chat_messages (id, conversation_id, role, content, selected_versions) VALUES (?, ?, ?, ?, ?)',
    args: [msgId, conversationId, role, content, JSON.stringify(selectedVersions || [])],
  });

  await db.execute({
    sql: 'UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    args: [conversationId],
  });

  res.json({ id: msgId, role, content });
});

// ============ Analysis Cache Endpoints ============

app.get('/api/analysis/:version', async (req, res) => {
  const { version } = req.params;

  const result = await db.execute({
    sql: 'SELECT analysis_json, created_at FROM analysis_cache WHERE version = ?',
    args: [version],
  });

  if (result.rows.length > 0) {
    res.json({
      analysis: JSON.parse(result.rows[0].analysis_json as string),
      cached: true,
      cachedAt: result.rows[0].created_at,
    });
  } else {
    res.status(404).json({ error: 'Analysis not cached' });
  }
});

app.post('/api/analysis/:version', async (req, res) => {
  const { version } = req.params;
  const { analysis } = req.body;

  await db.execute({
    sql: 'INSERT OR REPLACE INTO analysis_cache (version, analysis_json, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
    args: [version, JSON.stringify(analysis)],
  });

  res.json({ success: true });
});

app.get('/api/analysis', async (_req, res) => {
  const result = await db.execute('SELECT version, created_at FROM analysis_cache ORDER BY created_at DESC');
  res.json(result.rows);
});

// Email endpoint
function generateEmailHtml(data: ChangelogEmailRequest): string {
  const { version, tldr, categories, action_items, sentiment } = data;

  const sentimentEmoji = sentiment === 'positive' ? '🎉' : sentiment === 'critical' ? '⚠️' : '📋';

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #d97706; }
    h2 { color: #374151; margin-top: 24px; }
    .tldr { background: #fef3c7; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
    .section { margin-bottom: 20px; }
    .breaking { border-left: 4px solid #ef4444; padding-left: 12px; background: #fef2f2; padding: 12px; border-radius: 0 8px 8px 0; }
    .feature { border-left: 4px solid #14b8a6; padding-left: 12px; }
    .fix { border-left: 4px solid #6b7280; padding-left: 12px; }
    ul { padding-left: 20px; }
    li { margin-bottom: 8px; }
    .audio-note { background: #e0f2fe; padding: 12px; border-radius: 8px; margin-top: 16px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; }
  </style>
</head>
<body>
  <h1>${sentimentEmoji} Claude Code ${version} Released</h1>

  <div class="tldr">
    <strong>TL;DR:</strong> ${tldr}
  </div>
`;

  if (categories.critical_breaking_changes.length > 0) {
    html += `
  <div class="section breaking">
    <h2>🚨 Critical Breaking Changes</h2>
    <ul>
      ${categories.critical_breaking_changes.map((item) => `<li>${item}</li>`).join('')}
    </ul>
  </div>
`;
  }

  if (categories.removals.length > 0) {
    html += `
  <div class="section">
    <h2>⚠️ Removals</h2>
    <ul>
      ${categories.removals.map((r) => `<li><strong>${r.feature}</strong> (${r.severity}): ${r.why}</li>`).join('')}
    </ul>
  </div>
`;
  }

  if (categories.major_features.length > 0) {
    html += `
  <div class="section feature">
    <h2>✨ Major Features</h2>
    <ul>
      ${categories.major_features.map((item) => `<li>${item}</li>`).join('')}
    </ul>
  </div>
`;
  }

  if (categories.important_fixes.length > 0) {
    html += `
  <div class="section fix">
    <h2>🔧 Important Fixes</h2>
    <ul>
      ${categories.important_fixes.map((item) => `<li>${item}</li>`).join('')}
    </ul>
  </div>
`;
  }

  if (action_items.length > 0) {
    html += `
  <div class="section">
    <h2>📋 Action Items</h2>
    <ul>
      ${action_items.map((item) => `<li>${item}</li>`).join('')}
    </ul>
  </div>
`;
  }

  html += `
  <div class="audio-note">
    🎧 <strong>Audio summary attached!</strong> Listen to the changelog summary on the go.
  </div>

  <div class="footer">
    <p>This email was automatically sent by Claude Code Changelog Tracker</p>
  </div>
</body>
</html>
`;

  return html;
}

app.post('/api/send-changelog', async (req, res) => {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    console.error('Missing RESEND_API_KEY or NOTIFY_EMAIL environment variables');
    res.status(500).json({ success: false, error: 'Email configuration missing' });
    return;
  }

  try {
    const data = req.body as ChangelogEmailRequest;
    const html = generateEmailHtml(data);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Changelog Tracker <onboarding@resend.dev>',
        to: [NOTIFY_EMAIL],
        subject: `Claude Code ${data.version} Released`,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend API error:', error);
      res.status(500).json({ success: false, error: 'Failed to send email' });
      return;
    }

    const result = await response.json();
    console.log('Email sent successfully:', result);
    res.json({ success: true, id: result.id });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// SPA fallback - serve index.html for all non-API routes
app.use((_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start server
async function start() {
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database: Turso (${process.env.TURSO_DATABASE_URL ? 'remote' : 'local'})`);
  });

  // Initialize monitoring from saved settings
  const enabledResult = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: ['emailNotificationsEnabled'],
  });
  const intervalResult = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: ['notificationCheckInterval'],
  });

  const enabled = enabledResult.rows[0]?.value === 'true';
  const interval = parseInt((intervalResult.rows[0]?.value as string) || '0') || 0;

  if (enabled && interval > 0) {
    startMonitoring(interval);
  }
}

start().catch(console.error);
