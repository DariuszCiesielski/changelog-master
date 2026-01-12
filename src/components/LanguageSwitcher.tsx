import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  ];

  const currentLanguage = languages.find((lang) => lang.code === i18n.language) || languages[0];

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  return (
    <div className="relative group">
      <button
        className="p-2.5 text-charcoal-600 dark:text-cream-200 hover:text-charcoal-900 dark:hover:text-cream-50 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-xl transition-colors flex items-center gap-1"
        aria-label={t('language.select')}
        title={t('language.select')}
      >
        <Globe className="w-5 h-5" />
        <span className="text-xs font-medium uppercase">{currentLanguage.code}</span>
      </button>

      <div className="absolute right-0 top-full mt-2 w-36 bg-white dark:bg-charcoal-700 rounded-xl shadow-xl border border-cream-300 dark:border-charcoal-500 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 overflow-hidden">
        <div className="py-1">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors ${
                i18n.language === lang.code
                  ? 'text-coral-600 dark:text-coral-400 bg-cream-100 dark:bg-charcoal-600'
                  : 'text-charcoal-900 dark:text-cream-100 hover:bg-cream-100 dark:hover:bg-charcoal-600'
              }`}
            >
              <span className="text-lg">{lang.flag}</span>
              <span className="font-medium">{lang.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
