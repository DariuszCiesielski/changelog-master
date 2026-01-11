export interface ChangelogSource {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  last_version: string | null;
  last_checked_at: string | null;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  items: ChangelogItem[];
  sourceId?: string;
  sourceName?: string;
}

export interface ChangelogItem {
  type: 'feature' | 'fix' | 'removal' | 'breaking' | 'other';
  content: string;
}

export interface GeminiAnalysis {
  tldr: string;
  categories: {
    critical_breaking_changes: string[];
    removals: RemovalItem[];
    major_features: string[];
    important_fixes: string[];
    new_slash_commands: string[];
    terminal_improvements: string[];
    api_changes: string[];
  };
  action_items: string[];
  sentiment: 'positive' | 'neutral' | 'critical';
}

export interface RemovalItem {
  feature: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  why: string;
}

export type VoiceName =
  | 'Charon'
  | 'Puck'
  | 'Kore'
  | 'Zephyr'
  | 'Aoede'
  | 'Fenrir'
  | 'Leda'
  | 'Orus'
  | 'Callirrhoe'
  | 'Autonoe'
  | 'Enceladus'
  | 'Iapetus'
  | 'Umbriel'
  | 'Algieba'
  | 'Despina'
  | 'Erinome'
  | 'Algenib'
  | 'Rasalgethi'
  | 'Laomedeia'
  | 'Achernar'
  | 'Alnilam'
  | 'Schedar'
  | 'Gacrux'
  | 'Pulcherrima'
  | 'Achird'
  | 'Zubenelgenubi'
  | 'Vindemiatrix'
  | 'Sadachbia'
  | 'Sadaltager'
  | 'Sulafat';

export interface VoiceOption {
  name: VoiceName;
  tone: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { name: 'Charon', tone: 'Informative' },
  { name: 'Puck', tone: 'Upbeat' },
  { name: 'Kore', tone: 'Firm' },
  { name: 'Zephyr', tone: 'Bright' },
  { name: 'Aoede', tone: 'Breezy' },
  { name: 'Fenrir', tone: 'Excitable' },
  { name: 'Leda', tone: 'Youthful' },
  { name: 'Orus', tone: 'Firm' },
  { name: 'Callirrhoe', tone: 'Easy-going' },
  { name: 'Autonoe', tone: 'Bright' },
];

export interface AppState {
  rawChangelog: string | null;
  parsedChangelog: ChangelogVersion[];
  analysis: GeminiAnalysis | null;
  activeTab: 'changelog' | 'matters';
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string | null;
  audioUrl: string | null;
  isGeneratingAudio: boolean;
  isPlaying: boolean;
  selectedVoice: VoiceName;
  lastFetched: number | null;
}
