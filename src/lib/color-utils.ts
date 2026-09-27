/**
 * Color utility functions for bag colors
 */

/**
 * Named bag colors offered in color pickers, with their Tailwind swatch class.
 */
export const BAG_COLORS = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-500' },
  { value: 'black', label: 'Black', class: 'bg-black' },
  { value: 'white', label: 'White', class: 'bg-white' },
];

/**
 * Get the Tailwind swatch class for a named bag color, for rendering a color
 * dot next to a bag/template. Falls back to gray for unrecognized values.
 */
function getBagColorSwatchClass(value: string | null | undefined): string {
  return BAG_COLORS.find((c) => c.value === value)?.class || 'bg-gray-500';
}

/**
 * Get Tailwind background color class for a bag color
 * Returns undefined for hex colors (use getBagColorStyle instead)
 */
export function getBagColorClass(color: string | null | undefined): string | undefined {
  return color?.startsWith('#') ? undefined : getBagColorSwatchClass(color);
}

/**
 * Get the inline style for a hex bag color, as a Solid style object (whose
 * keys are CSS property names, not camelCase).
 */
export function getBagColorStyle(
  color: string | null | undefined
): { 'background-color': string } | undefined {
  if (!color) return undefined;

  // Only return style for hex colors
  if (color.startsWith('#')) {
    return { 'background-color': color };
  }

  return undefined;
}
