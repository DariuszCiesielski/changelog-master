import { useState, useRef, useEffect } from 'react';
import { RefreshCw, Sun, Moon, Mail, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsPanel } from './SettingsPanel';
import { SourcesPanel } from './SourcesPanel';
import { LanguageSwitcher } from './LanguageSwitcher';
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
  const { t, i18n } = useTranslation();
  const [isSourceDropdownOpen, setIsSourceDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formatLastFetched = (timestamp: number | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString(i18n.language);
  };

  const activeSources = sources.filter(s => s.is_active);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSourceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="border-b border-cream-300 dark:border-charcoal-500 bg-white dark:bg-charcoal-800 sticky top-0 z-10 transition-colors duration-500">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2" ref={dropdownRef}>
              {activeSources.length > 0 && onSelectSource ? (
                <div className="relative">
                  <button
                    onClick={() => setIsSourceDropdownOpen(!isSourceDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xl font-semibold text-charcoal-900 dark:text-cream-50 tracking-tight transition-colors duration-300 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-xl"
                  >
                    <span>{selectedSourceName} {t('header.changelog')}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isSourceDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isSourceDropdownOpen && (
                    <div className="absolute left-0 top-full mt-2 w-80 bg-white dark:bg-charcoal-700 rounded-xl shadow-xl border border-cream-300 dark:border-charcoal-500 z-50 overflow-hidden">
                      <div className="py-2">
                        <div className="px-4 py-2 text-xs font-medium text-charcoal-500 dark:text-charcoal-400 uppercase tracking-wider">
                          {t('header.selectSource')}
                        </div>
                        {activeSources.map((source) => (
                          <button
                            key={source.id}
                            onClick={() => {
                              onSelectSource(source.id);
                              setIsSourceDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors ${
                              source.id === selectedSourceId
                                ? 'text-coral-600 dark:text-coral-400 bg-cream-100 dark:bg-charcoal-600'
                                : 'text-charcoal-900 dark:text-cream-100 hover:bg-cream-100 dark:hover:bg-charcoal-600'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {source.id === selectedSourceId && <Check className="w-4 h-4 flex-shrink-0" />}
                              <span className="truncate font-medium">{source.name}</span>
                            </div>
                            {source.last_version && (
                              <span className="text-xs text-charcoal-500 dark:text-charcoal-400 ml-2 font-mono bg-cream-200 dark:bg-charcoal-500 px-2 py-0.5 rounded flex-shrink-0">
                                v{source.last_version}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <h1 className="text-xl font-semibold text-charcoal-900 dark:text-cream-50 tracking-tight transition-colors duration-300">
                  {selectedSourceName} {t('header.changelog')}
                </h1>
              )}
            </div>
            <span className="px-3 py-1.5 text-sm font-medium bg-teal-500 text-white rounded-full shadow-sm">
              v{version}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {lastFetched && (
              <span className="text-sm text-charcoal-500 dark:text-cream-300 hidden sm:block mr-2 transition-colors">
                {t('header.updated')}: {formatLastFetched(lastFetched)}
              </span>
            )}

            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2.5 text-charcoal-600 dark:text-cream-200 hover:text-charcoal-900 dark:hover:text-cream-50 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-xl transition-colors disabled:opacity-50"
              aria-label={t('header.refresh')}
              title={t('header.refresh')}
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onToggleTheme}
              className="p-2.5 text-charcoal-600 dark:text-cream-200 hover:text-charcoal-900 dark:hover:text-cream-50 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-xl transition-colors relative overflow-hidden"
              aria-label={theme === 'light' ? t('header.darkMode') : t('header.lightMode')}
              title={theme === 'light' ? t('header.darkMode') : t('header.lightMode')}
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
              aria-label={t('header.sendToEmail')}
              title={t('header.sendToEmail')}
            >
              <Mail className={`w-5 h-5 ${isEmailSending ? 'animate-pulse' : ''}`} />
            </button>

            <LanguageSwitcher />

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
