interface TabNavProps {
  activeTab: 'changelog' | 'matters';
  onTabChange: (tab: 'changelog' | 'matters') => void;
  isAnalyzing: boolean;
}

export function TabNav({ activeTab, onTabChange, isAnalyzing }: TabNavProps) {
  return (
    <nav className="border-b border-cream-300 dark:border-charcoal-500 bg-white dark:bg-charcoal-800 transition-colors duration-500">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex gap-1">
          <button
            onClick={() => onTabChange('changelog')}
            className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-all duration-300 ${
              activeTab === 'changelog'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-charcoal-500 dark:text-charcoal-400 hover:text-charcoal-900 dark:hover:text-cream-50 hover:bg-cream-100 dark:hover:bg-charcoal-700'
            }`}
            aria-selected={activeTab === 'changelog'}
            role="tab"
          >
            Changelog
          </button>
          <button
            onClick={() => onTabChange('matters')}
            className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-all duration-300 flex items-center gap-2 ${
              activeTab === 'matters'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-charcoal-500 dark:text-charcoal-400 hover:text-charcoal-900 dark:hover:text-cream-50 hover:bg-cream-100 dark:hover:bg-charcoal-700'
            }`}
            aria-selected={activeTab === 'matters'}
            role="tab"
          >
            What Matters
            {isAnalyzing && (
              <span className="w-2 h-2 bg-coral-500 rounded-full animate-pulse" />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
