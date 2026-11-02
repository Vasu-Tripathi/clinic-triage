import { z } from 'zod';
import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
import { id, isoDate } from '@/lib/validators.mjs';

const schema = z.object({
  appt_id: id,
  diagnosis: z.string().trim().min(3).max(200),
  advice: z.string().max(2000).optional(),
  follow_up_on: isoDate.optional().or(z.literal('')),
  items: z.array(z.object({
    medicine: z.string().trim().min(2).max(100),
    dosage: z.string().trim().min(1).max(40),
    frequency: z.string().trim().min(1).max(40),
    duration_days: z.coerce.number().int().min(1).max(365),
  })).max(15),
});

export const POST = route(['doctor'], async ({ req, user }) => {
  const b = schema.parse(await req.json());
  return withUser(user, async (c) => {
    await c.query('CALL sp_complete_appointment($1, $2, $3, $4, $5::jsonb)',
      [b.appt_id, b.diagnosis, b.advice || null, b.follow_up_on || null, JSON.stringify(b.items)]);
    return { ok: true };
  });
});
