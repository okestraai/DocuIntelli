// Emerald/teal/slate palette — matching web brand
export const colors = {
  primary: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },
  teal: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
  },
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
  // Status color families (matching web badge styles)
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
  },
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
  },
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
  },
  info: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
  },
  // Category colors (matching web document badges)
  category: {
    insurance: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    warranty: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
    lease: { bg: '#f3e8ff', text: '#6b21a8', border: '#c4b5fd' },
    employment: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
    contract: { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
    other: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  },
  white: '#ffffff',
  black: '#000000',
  // Gradient endpoints (for LinearGradient components)
  gradient: {
    primary: ['#059669', '#0d9488'] as const, // emerald-600 → teal-600
    primaryLight: ['#ecfdf5', '#f0fdfa'] as const, // emerald-50 → teal-50
    danger: ['#ef4444', '#f97316'] as const, // red-500 → orange-500
  },
};
