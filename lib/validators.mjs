import { z } from 'zod';
export const email = z.string().trim().toLowerCase().email().max(120);
export const password = z.string().min(8).max(72)
  .regex(/[A-Z]/, 'needs an uppercase letter').regex(/[0-9]/, 'needs a digit');
export const phone = z.string().regex(/^\+?[0-9]{10,13}$/, 'invalid phone').optional().or(z.literal(''));
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/);
export const id = z.coerce.number().int().positive();

// crude red-flag screen: these phrases should go to emergency care, not a booking
const RED_FLAGS = [
  /chest (pain|tightness|pressure)/i, /can'?t breathe|unable to breathe|severe(ly)? (short|difficult)/i,
  /fainted|unconscious|passed out/i, /slurred speech|face (droop|drooping)|one side (weak|numb)/i,
  /suicid|kill myself|self.?harm/i, /vomiting blood|coughing (up )?blood/i, /seizure|fits/i,
];
export const isRedFlag = (text, severity) => severity >= 9 || RED_FLAGS.some((r) => r.test(text));
