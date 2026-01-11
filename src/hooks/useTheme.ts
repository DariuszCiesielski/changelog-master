import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      // Check if user has manually set a theme
      const saved = localStorage.getItem('theme') as Theme;
      if (saved) return saved;

      // Check if there's a default theme preference
      const defaultTheme = localStorage.getItem('defaultTheme') as Theme;
      if (defaultTheme) return defaultTheme;

      // Fall back to system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setDefaultTheme = (defaultTheme: Theme) => {
    localStorage.setItem('defaultTheme', defaultTheme);
  };

  const getDefaultTheme = (): Theme => {
    return (localStorage.getItem('defaultTheme') as Theme) || 'light';
  };

  return { theme, toggleTheme, setDefaultTheme, getDefaultTheme };
}
