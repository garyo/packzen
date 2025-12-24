// Utility functions

// Parse date string in local timezone (YYYY-MM-DD format)
// Appending 'T00:00:00' makes the date parse as local time instead of UTC
function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

// Format date for display
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Format a date range intelligently based on overlap
// Examples:
//   "Jan 1-4, 2026" (same month and year)
//   "Jan 1-Feb 2, 2026" (different months, same year)
//   "Dec 31, 2025 - Jan 2, 2026" (spans years)
//   "Jan 1, 2026" (only start date)
//   "Through Feb 2, 2026" (only end date)
export function formatDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string {
  // Handle missing dates
  if (!startDate && !endDate) return '';
  if (!startDate && endDate) {
    return `Through ${formatDate(endDate)}`;
  }
  if (startDate && !endDate) {
    return formatDate(startDate);
  }

  const start = parseLocalDate(startDate!);
  const end = parseLocalDate(endDate!);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  // Same date
  if (startDate === endDate) {
    return formatDate(start);
  }

  // Spans multiple years
  if (startYear !== endYear) {
    return `${formatDate(start)} - ${formatDate(end)}`;
  }

  // Same month and year
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}, ${startYear}`;
  }

  // Different months, same year
  return `${startMonth} ${startDay}-${endMonth} ${endDay}, ${startYear}`;
}

// Calculate trip duration in days
export function getTripDuration(startDate: string, endDate: string): number {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const diff = end.getTime() - start.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
}

// Check if trip is upcoming, active, or past
export function getTripStatus(startDate: string, endDate: string): 'upcoming' | 'active' | 'past' {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Strip time component

  const start = parseLocalDate(startDate);
  start.setHours(0, 0, 0, 0);

  const end = parseLocalDate(endDate);
  end.setHours(0, 0, 0, 0);

  if (now < start) return 'upcoming';
  if (now > end) return 'past';
  return 'active';
}

// Calculate packing progress percentage
export function getPackingProgress(packedCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  return Math.round((packedCount / totalCount) * 100);
}

// Generate a random color for bag identification
export function generateRandomColor(): string {
  const colors = [
    '#ef4444', // red
    '#f97316', // orange
    '#f59e0b', // amber
    '#eab308', // yellow
    '#84cc16', // lime
    '#22c55e', // green
    '#10b981', // emerald
    '#14b8a6', // teal
    '#06b6d4', // cyan
    '#0ea5e9', // sky
    '#3b82f6', // blue
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#a855f7', // purple
    '#d946ef', // fuchsia
    '#ec4899', // pink
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Debounce function for search inputs
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Class name helper (similar to clsx)
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function normalizeTripDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): { startDate: string | null; endDate: string | null } {
  const normalizedStart = startDate?.trim() ? startDate.trim() : null;
  const normalizedEnd = endDate?.trim() ? endDate.trim() : null;

  if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
    return {
      startDate: normalizedEnd,
      endDate: normalizedStart,
    };
  }

  return {
    startDate: normalizedStart,
    endDate: normalizedEnd,
  };
}
