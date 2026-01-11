import { RefreshCw, Sun, Moon, Mail, ChevronDown } from 'lucide-react';
import { SettingsPanel } from './SettingsPanel';
import { SourcesPanel } from './SourcesPanel';
import type { ChangelogSource } from '../types';

interface HeaderProps {
  version: string;
  lastFetched: number | null;
  isLoading: boolean;
  onRefresh: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSendEmail: () => void;
  isEmailSending: boolean;
  refreshInterval: number;
  onRefreshIntervalChange: (interval: number) => void;
  defaultTheme: 'light' | 'dark';
  onDefaultThemeChange: (theme: 'light' | 'dark') => void;
  sources?: ChangelogSource[];
  selectedSourceId: string | null;
  selectedSourceName: string;
  onSelectSource?: (sourceId: string | null) => void;
}

export function Header({
  version,
  lastFetched,
  isLoading,
  onRefresh,
  theme,
  onToggleTheme,
  onSendEmail,
  isEmailSending,
  refreshInterval,
  onRefreshIntervalChange,
  defaultTheme,
  onDefaultThemeChange,
  sources = [],
  selectedSourceId,
  selectedSourceName,
  onSelectSource,
}: HeaderProps) {
  const formatLastFetched = (timestamp: number | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const activeSources = sources.filter(s => s.is_active);

  return (
    <header className="border-b border-cream-300 dark:border-charcoal-500 bg-white dark:bg-charcoal-800 sticky top-0 z-10 transition-colors duration-500">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-charcoal-900 dark:text-cream-50 tracking-tight transition-colors duration-300">
                {selectedSourceName} Changelog
              </h1>
              {activeSources.length > 1 && onSelectSource && (
                <div className="relative group">
                  <button
                    className="p-1.5 text-charcoal-500 dark:text-charcoal-400 hover:text-charcoal-900 dark:hover:text-cream-50 rounded-lg hover:bg-cream-200 dark:hover:bg-charcoal-700 transition-colors"
                    aria-label="Switch changelog source"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-charcoal-700 rounded-xl shadow-xl border border-cream-300 dark:border-charcoal-500 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 overflow-hidden">
                    <div className="py-2">
                      {activeSources.map((source) => (
                        <button
                          key={source.id}
                          onClick={() => onSelectSource(source.id)}
                          className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors ${
                            source.id === selectedSourceId
                              ? 'text-coral-600 dark:text-coral-400 bg-cream-100 dark:bg-charcoal-600'
                              : 'text-charcoal-900 dark:text-cream-100 hover:bg-cream-100 dark:hover:bg-charcoal-600'
                          }`}
                        >
                          <span className="truncate font-medium">{source.name}</span>
                          {source.last_version && (
                            <span className="text-xs text-charcoal-500 dark:text-charcoal-400 ml-2 font-mono bg-cream-200 dark:bg-charcoal-500 px-2 py-0.5 rounded">
                              v{source.last_version}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <span className="px-3 py-1.5 text-sm font-medium bg-teal-500 text-white rounded-full shadow-sm">
              v{version}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {lastFetched && (
              <span className="text-sm text-charcoal-500 dark:text-cream-300 hidden sm:block mr-2 transition-colors">
                Updated: {formatLastFetched(lastFetched)}
              </span>
            )}

            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2.5 text-charcoal-600 dark:text-cream-200 hover:text-charcoal-900 dark:hover:text-cream-50 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-xl transition-colors disabled:opacity-50"
              aria-label="Refresh changelog"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onToggleTheme}
              className="p-2.5 text-charcoal-600 dark:text-cream-200 hover:text-charcoal-900 dark:hover:text-cream-50 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-xl transition-colors relative overflow-hidden"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={theme === 'light' ? 'Dark mode' : 'Light mode'}
            >
              <div className="relative w-5 h-5">
                <Sun
                  className={`w-5 h-5 absolute inset-0 transition-all duration-500 ${
                    theme === 'dark'
                      ? 'rotate-0 scale-100 opacity-100'
                      : 'rotate-90 scale-0 opacity-0'
                  }`}
                />
                <Moon
                  className={`w-5 h-5 absolute inset-0 transition-all duration-500 ${
                    theme === 'light'
                      ? 'rotate-0 scale-100 opacity-100'
                      : '-rotate-90 scale-0 opacity-0'
                  }`}
                />
              </div>
            </button>

            <button
              onClick={onSendEmail}
              disabled={isEmailSending}
              className="p-2.5 text-charcoal-600 dark:text-cream-200 hover:text-charcoal-900 dark:hover:text-cream-50 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-xl transition-colors disabled:opacity-50"
              aria-label="Send changelog to email"
              title="Send to email"
            >
              <Mail className={`w-5 h-5 ${isEmailSending ? 'animate-pulse' : ''}`} />
            </button>

            <SourcesPanel />

            <SettingsPanel
              refreshInterval={refreshInterval}
              onRefreshIntervalChange={onRefreshIntervalChange}
              defaultTheme={defaultTheme}
              onDefaultThemeChange={onDefaultThemeChange}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
