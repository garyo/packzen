/**
 * Color utility functions for bag colors
 */

import type { ColorName } from './validation';

/**
 * Get Tailwind background color class for a bag color
 * Returns undefined for hex colors (use getBagColorStyle instead)
 */
export function getBagColorClass(color: string | null | undefined): string | undefined {
  if (!color) return 'bg-gray-500';

  // Check if it's a hex color
  if (color.startsWith('#')) {
    return undefined; // Use inline style instead
  }

  // Map color names to Tailwind classes
  const colorMap: Record<ColorName, string> = {
    blue: 'bg-blue-500',
    red: 'bg-red-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    black: 'bg-black',
    gray: 'bg-gray-500',
  };

  return colorMap[color as ColorName] || 'bg-gray-500';
}

/**
 * Get inline style object for a bag color (used for hex colors)
 */
export function getBagColorStyle(
  color: string | null | undefined
): { backgroundColor: string } | undefined {
  if (!color) return undefined;

  // Only return style for hex colors
  if (color.startsWith('#')) {
    return { backgroundColor: color };
  }

  return undefined;
}
