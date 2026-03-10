import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface CloudProviderIconProps {
  provider: string;
  size?: number;
}

export function CloudProviderIcon({ provider, size = 16 }: CloudProviderIconProps) {
  switch (provider) {
    case 'google_drive':
      return (
        <Svg width={size} height={size} viewBox="0 0 87.3 78">
          <Path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA" />
          <Path d="M43.65 25.15L29.9 1.35c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5l16.15-27.85z" fill="#00AC47" />
          <Path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85L53.1 64.45l-3.7 6.4 13.75 23.8c1.35-.8 2.5-1.9 3.3-3.3l7.1-14.55z" fill="#EA4335" />
          <Path d="M43.65 25.15L57.4 1.35C56.05.55 54.5 0 52.9 0H34.4c-1.6 0-3.15.55-4.5 1.35l13.75 23.8z" fill="#00832D" />
          <Path d="M59.85 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h36.85c1.6 0 3.15-.4 4.5-1.2L59.85 53z" fill="#2684FC" />
          <Path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25.15 59.85 53h27.45c0-1.55-.4-3.1-1.2-4.5L73.4 26.5z" fill="#FFBA00" />
        </Svg>
      );

    case 'dropbox':
      return (
        <Svg width={size} height={size} viewBox="0 0 43 40">
          <Path d="M12.6 0L0 8.1l8.9 7.1 12.6-7.8L12.6 0zM0 22.3l12.6 8.1 8.9-7.4-12.6-7.8L0 22.3zm21.5.7l8.9 7.4 12.6-8.1-8.9-7.1-12.6 7.8zm12.6-15.6L21.5 0l-8.9 7.4 12.6 7.8 8.9-7.8zM12.7 32.4l8.9 7.4 8.9-7.4-8.9-5.8-8.9 5.8z" fill="#0061FF" />
        </Svg>
      );

    case 'onedrive':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M10.5 18.5h8.25a3.75 3.75 0 001.1-7.33 4.5 4.5 0 00-8.42-1.5A3 3 0 008.25 12H8a3 3 0 00-.5 5.96l3 .54z" fill="#0364B8" />
          <Path d="M10.5 18.5l-3-0.54A3 3 0 018 12h.25a3 3 0 013.08-2.33l.57.08A4.48 4.48 0 0114.25 8a4.5 4.5 0 011.87.41A3.75 3.75 0 0010.5 12v6.5z" fill="#0078D4" />
          <Path d="M18.75 18.5H10.5V12a3.75 3.75 0 017.35-.83 3.75 3.75 0 01.9 7.33z" fill="#1490DF" />
        </Svg>
      );

    default:
      // Generic cloud icon
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </Svg>
      );
  }
}
