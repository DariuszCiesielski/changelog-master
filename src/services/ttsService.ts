import type { VoiceName } from '../types';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const TTS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function pcmToWav(pcmData: ArrayBuffer): ArrayBuffer {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.byteLength;
  const headerSize = 44;

  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, headerSize).set(new Uint8Array(pcmData));

  return buffer;
}

// Check SQLite cache via API
export async function getCachedAudio(textHash: string, voice: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(`/api/audio/${textHash}/${voice}`);
    if (response.ok) {
      return response.arrayBuffer();
    }
    return null;
  } catch {
    return null;
  }
}

// Convert ArrayBuffer to base64 (handles large files)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Save to SQLite cache via API
async function setCachedAudio(textHash: string, voice: string, audioData: ArrayBuffer): Promise<void> {
  try {
    const base64 = arrayBufferToBase64(audioData);
    const response = await fetch('/api/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textHash, voice, audioData: base64 }),
    });
    if (response.ok) {
      console.log('Audio cached successfully');
    } else {
      console.error('Failed to cache audio:', await response.text());
    }
  } catch (error) {
    console.error('Failed to cache audio:', error);
  }
}

export { hashString };

export async function generateAudio(text: string, voiceName: VoiceName): Promise<ArrayBuffer> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const textHash = hashString(text);

  // Check SQLite cache first
  const cached = await getCachedAudio(textHash, voiceName);
  if (cached) {
    console.log('Using cached audio from SQLite');
    return cached;
  }

  const response = await fetch(`${TTS_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Read this changelog summary in a clear, informative tone:\n\n${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const base64Audio = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!base64Audio) {
    throw new Error('No audio data in response');
  }

  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const wavBuffer = pcmToWav(bytes.buffer);

  // Save to SQLite cache
  await setCachedAudio(textHash, voiceName, wavBuffer);

  return wavBuffer;
}

export function createAudioUrl(wavBuffer: ArrayBuffer): string {
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export function downloadAudio(wavBuffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
