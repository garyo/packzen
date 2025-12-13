/**
 * Input Validation and Sanitization Utilities
 *
 * Using Zod for schema validation to ensure:
 * - Type safety
 * - Input sanitization
 * - Protection against injection attacks
 * - Data integrity
 */

import { z } from 'zod';

// Common validation rules
const MAX_NAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_NOTES_LENGTH = 10000;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 9999;

// ISO 8601 date string regex (YYYY-MM-DD format)
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Sanitization helpers
/**
 * Sanitize string input to prevent XSS and injection attacks
 * - Trims whitespace
 * - Removes null bytes
 * - Limits length
 */
function sanitizeString(maxLength: number = MAX_NAME_LENGTH) {
  return z
    .string()
    .trim()
    .transform((val) => val.replace(/\0/g, '')) // Remove null bytes
    .refine((val) => val.length <= maxLength, {
      message: `String must be ${maxLength} characters or less`,
    });
}

/**
 * Validate ISO date string
 */
function isoDateString() {
  return z
    .string()
    .regex(ISO_DATE_REGEX, 'Must be a valid ISO date string (YYYY-MM-DD)')
    .nullable()
    .optional();
}

// Category schemas
export const categoryCreateSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH),
  icon: z.string().trim().max(10).nullable().optional(), // Emoji or short icon code
  sort_order: z.number().int().min(0).optional(),
});

export const categoryUpdateSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH).optional(),
  icon: z.string().trim().max(10).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

// Master Item schemas
export const masterItemCreateSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH),
  description: sanitizeString(MAX_DESCRIPTION_LENGTH).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  default_quantity: z
    .number()
    .int()
    .min(MIN_QUANTITY)
    .max(MAX_QUANTITY)
    .default(1),
});

export const masterItemUpdateSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH).optional(),
  description: sanitizeString(MAX_DESCRIPTION_LENGTH).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  default_quantity: z
    .number()
    .int()
    .min(MIN_QUANTITY)
    .max(MAX_QUANTITY)
    .optional(),
});

// Trip schemas
export const tripCreateSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH),
  destination: sanitizeString(MAX_NAME_LENGTH).nullable().optional(),
  start_date: isoDateString(),
  end_date: isoDateString(),
  notes: sanitizeString(MAX_NOTES_LENGTH).nullable().optional(),
});

export const tripUpdateSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH).optional(),
  destination: sanitizeString(MAX_NAME_LENGTH).nullable().optional(),
  start_date: isoDateString(),
  end_date: isoDateString(),
  notes: sanitizeString(MAX_NOTES_LENGTH).nullable().optional(),
});

// Bag schemas
export const bagCreateSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH),
  type: z.enum(['carry_on', 'checked', 'personal', 'custom']),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const bagUpdateSchema = z.object({
  bag_id: z.string().uuid(),
  name: sanitizeString(MAX_NAME_LENGTH).optional(),
  type: z.enum(['carry_on', 'checked', 'personal', 'custom']).optional(),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').nullable().optional(),
});

// Trip Item schemas
export const tripItemCreateSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH),
  category_name: sanitizeString(MAX_NAME_LENGTH).nullable().optional(),
  quantity: z.number().int().min(MIN_QUANTITY).max(MAX_QUANTITY).default(1),
  bag_id: z.string().uuid().nullable().optional(),
  master_item_id: z.string().uuid().nullable().optional(),
});

export const tripItemUpdateSchema = z.object({
  id: z.string().uuid(),
  name: sanitizeString(MAX_NAME_LENGTH).optional(),
  category_name: sanitizeString(MAX_NAME_LENGTH).nullable().optional(),
  quantity: z.number().int().min(MIN_QUANTITY).max(MAX_QUANTITY).optional(),
  bag_id: z.string().uuid().nullable().optional(),
  is_packed: z.boolean().optional(),
});

// Validation helper types
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type MasterItemCreate = z.infer<typeof masterItemCreateSchema>;
export type MasterItemUpdate = z.infer<typeof masterItemUpdateSchema>;
export type TripCreate = z.infer<typeof tripCreateSchema>;
export type TripUpdate = z.infer<typeof tripUpdateSchema>;
export type BagCreate = z.infer<typeof bagCreateSchema>;
export type BagUpdate = z.infer<typeof bagUpdateSchema>;
export type TripItemCreate = z.infer<typeof tripItemCreateSchema>;
export type TripItemUpdate = z.infer<typeof tripItemUpdateSchema>;

/**
 * Validate and sanitize request body
 * Returns validated data or throws ZodError
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Validate and sanitize request body (safe version)
 * Returns { success: true, data } or { success: false, error }
 */
export function validateRequestSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
  };
}

// YAML Import Schemas
const yamlBagSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH),
  type: z.enum(['carry_on', 'checked', 'personal', 'custom']),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});

const yamlTripItemSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH),
  category_name: sanitizeString(MAX_NAME_LENGTH).nullable().optional(),
  quantity: z.number().int().min(MIN_QUANTITY).max(MAX_QUANTITY).default(1),
  bag_name: sanitizeString(MAX_NAME_LENGTH).nullable().optional(),
  is_packed: z.boolean().default(false),
  notes: sanitizeString(MAX_NOTES_LENGTH).nullable().optional(),
});

export const yamlTripExportSchema = z.object({
  trip: z.object({
    name: sanitizeString(MAX_NAME_LENGTH),
    destination: sanitizeString(MAX_NAME_LENGTH).nullable().optional(),
    start_date: isoDateString(),
    end_date: isoDateString(),
    notes: sanitizeString(MAX_NOTES_LENGTH).nullable().optional(),
  }),
  bags: z.array(yamlBagSchema).default([]),
  items: z.array(yamlTripItemSchema).default([]),
});

const yamlCategorySchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH),
  icon: z.string().trim().max(10).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});

const yamlMasterItemSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH),
  description: sanitizeString(MAX_DESCRIPTION_LENGTH).nullable().optional(),
  category_name: sanitizeString(MAX_NAME_LENGTH).nullable().optional(),
  default_quantity: z.number().int().min(MIN_QUANTITY).max(MAX_QUANTITY).default(1),
});

const yamlFullTripSchema = z.object({
  name: sanitizeString(MAX_NAME_LENGTH),
  destination: sanitizeString(MAX_NAME_LENGTH).nullable().optional(),
  start_date: isoDateString(),
  end_date: isoDateString(),
  notes: sanitizeString(MAX_NOTES_LENGTH).nullable().optional(),
  bags: z.array(yamlBagSchema).default([]),
  items: z.array(yamlTripItemSchema).default([]),
});

export const yamlFullBackupSchema = z.object({
  exportDate: z.string().optional(),
  version: z.string().refine((v) => v === '1.0', {
    message: 'Unsupported backup version. Only version 1.0 is supported.',
  }),
  categories: z.array(yamlCategorySchema).default([]),
  masterItems: z.array(yamlMasterItemSchema).default([]),
  trips: z.array(yamlFullTripSchema).default([]),
});

export type YamlTripExport = z.infer<typeof yamlTripExportSchema>;
export type YamlFullBackup = z.infer<typeof yamlFullBackupSchema>;
