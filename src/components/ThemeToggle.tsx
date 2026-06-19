import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') return 'dark';
    if (saved === 'light') return 'light';
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return system ? 'dark' : 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    // Dispatch event to sync any other ThemeToggle components
    window.dispatchEvent(new Event('theme-change'));
  }, [theme]);

  useEffect(() => {
    const handleSync = () => {
      const current = localStorage.getItem('theme') as 'light' | 'dark';
      if (current && current !== theme) {
        setTheme(current);
      }
    };
    window.addEventListener('theme-change', handleSync);
    return () => window.removeEventListener('theme-change', handleSync);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-all duration-200 cursor-pointer flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm hover:scale-105 active:scale-95"
      aria-label="Toggle Theme"
      id="theme-switcher-btn"
    >
      {theme === 'light' ? (
        <Moon size={18} className="text-slate-600 dark:text-slate-300 transition-transform duration-300 rotate-0 hover:-rotate-12" />
      ) : (
        <Sun size={18} className="text-yellow-500 transition-transform duration-300 rotate-0 hover:rotate-45" />
      )}
    </button>
  );
}
