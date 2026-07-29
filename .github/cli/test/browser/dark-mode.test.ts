import fs from 'node:fs';
import * as path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '../../../../assets/js/partials/dark-mode.js'),
  'utf8',
);

interface DarkModeApi {
  currentTheme: () => string | null;
  setMode: (theme: string) => void;
  themeToggle: () => void;
  bootstrapTheme: () => void;
}

function loadDarkMode(): DarkModeApi {
  (0, eval)(SRC);
  const w = window as unknown as DarkModeApi;
  return {
    currentTheme: w.currentTheme,
    setMode: w.setMode,
    themeToggle: w.themeToggle,
    bootstrapTheme: w.bootstrapTheme,
  };
}

function mockMatchMedia(prefersDark: boolean) {
  (window as any).matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: prefersDark && query === '(prefers-color-scheme: dark)',
    media: query,
    addEventListener: jest.fn(),
  }));
}

describe('Dark Mode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '<button id="theme-toggle"></button>';
    mockMatchMedia(false);
    (global as any).darkBtn = 'Dark';
    (global as any).lightBtn = 'Light';
    (global as any).isAutoTheme = false;
  });

  afterEach(() => {
    delete (global as any).darkBtn;
    delete (global as any).lightBtn;
    delete (global as any).isAutoTheme;
  });

  describe('currentTheme()', () => {
    test('should return null when no theme is set', () => {
      const { currentTheme } = loadDarkMode();
      expect(currentTheme()).toBeNull();
    });

    test('should return theme from localStorage', () => {
      localStorage.setItem('theme', 'dark');
      const { currentTheme } = loadDarkMode();
      expect(currentTheme()).toEqual('dark');
    });
  });

  describe('setMode()', () => {
    test('should set data-theme attribute on document', () => {
      const { setMode } = loadDarkMode();
      setMode('dark');
      expect(document.documentElement.getAttribute('data-theme')).toEqual('dark');
    });

    test('should save theme to localStorage', () => {
      const { setMode } = loadDarkMode();
      setMode('dark');
      expect(localStorage.getItem('theme')).toEqual('dark');
    });

    test('should update theme toggle button innerHTML', () => {
      const { setMode } = loadDarkMode();
      setMode('dark');
      const toggle = document.getElementById('theme-toggle');
      expect(toggle!.innerHTML).toContain('Light');
      expect(toggle!.innerHTML).toContain('fa-rotate-180');
    });

    test('should handle light mode correctly', () => {
      const { setMode } = loadDarkMode();
      setMode('light');
      expect(document.documentElement.getAttribute('data-theme')).toEqual('light');
      expect(document.getElementById('theme-toggle')!.innerHTML).toContain('Dark');
    });

    test('should not error if toggle button does not exist', () => {
      document.getElementById('theme-toggle')!.remove();
      const { setMode } = loadDarkMode();
      expect(() => setMode('dark')).not.toThrow();
    });
  });

  describe('themeToggle()', () => {
    test('should toggle from light to dark', () => {
      const { setMode, themeToggle, currentTheme } = loadDarkMode();
      setMode('light');
      themeToggle();
      expect(currentTheme()).toEqual('dark');
      expect(document.documentElement.getAttribute('data-theme')).toEqual('dark');
    });

    test('should toggle from dark to light', () => {
      const { setMode, themeToggle, currentTheme } = loadDarkMode();
      setMode('dark');
      themeToggle();
      expect(currentTheme()).toEqual('light');
      expect(document.documentElement.getAttribute('data-theme')).toEqual('light');
    });

    test('should default to light when no theme is set', () => {
      const { themeToggle, currentTheme } = loadDarkMode();
      themeToggle();
      expect(currentTheme()).toEqual('light');
    });

    test('should toggle multiple times correctly', () => {
      const { setMode, themeToggle, currentTheme } = loadDarkMode();
      setMode('light');
      themeToggle();
      expect(currentTheme()).toEqual('dark');
      themeToggle();
      expect(currentTheme()).toEqual('light');
      themeToggle();
      expect(currentTheme()).toEqual('dark');
    });
  });

  describe('bootstrapTheme() (runs on load)', () => {
    test('should set light mode by default when no preference', () => {
      (global as any).isAutoTheme = true;
      mockMatchMedia(false);
      loadDarkMode();
      expect(document.documentElement.getAttribute('data-theme')).toEqual('light');
    });

    test('should respect existing localStorage theme', () => {
      localStorage.setItem('theme', 'dark');
      (global as any).isAutoTheme = true;
      loadDarkMode();
      expect(document.documentElement.getAttribute('data-theme')).toEqual('dark');
    });

    test('should respect browser preference for dark mode', () => {
      (global as any).isAutoTheme = true;
      mockMatchMedia(true);
      loadDarkMode();
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
      expect(document.documentElement.getAttribute('data-theme')).toEqual('dark');
    });

    test('should not set theme when isAutoTheme is false', () => {
      (global as any).isAutoTheme = false;
      loadDarkMode();
      expect(localStorage.getItem('theme')).toBeNull();
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });
  });

  describe('fallback when head globals are absent', () => {
    test('should not throw and use default labels when darkBtn/lightBtn are undefined', () => {
      delete (global as any).darkBtn;
      delete (global as any).lightBtn;

      let api: DarkModeApi;
      expect(() => { api = loadDarkMode(); }).not.toThrow();

      api!.setMode('dark');
      expect(document.getElementById('theme-toggle')!.innerHTML).toContain('Light');
      api!.setMode('light');
      expect(document.getElementById('theme-toggle')!.innerHTML).toContain('Dark');
    });

    test('should default isAutoTheme to true when it is undefined', () => {
      delete (global as any).isAutoTheme;
      mockMatchMedia(true);
      loadDarkMode();
      expect(document.documentElement.getAttribute('data-theme')).toEqual('dark');
    });
  });
});
