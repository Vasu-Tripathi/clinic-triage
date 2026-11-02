import { z } from 'zod';
import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
import { id } from '@/lib/validators.mjs';

export const PATCH = route(['admin'], async ({ req, user, params }) => {
  const docId = id.parse(params.id);
  const b = z.object({
    consultation_fee: z.coerce.number().positive().optional(),
    max_daily_patients: z.coerce.number().int().min(1).max(60).optional(),
    is_active: z.boolean().optional(),
  }).parse(await req.json());
  return withUser(user, async (c) => {
    if (b.is_active !== undefined)
      await c.query('UPDATE users SET is_active = $2 WHERE user_id = $1 AND role = \'doctor\'', [docId, b.is_active]);
    if (b.consultation_fee !== undefined || b.max_daily_patients !== undefined)
      await c.query(
        `UPDATE doctors SET consultation_fee = COALESCE($2, consultation_fee),
                            max_daily_patients = COALESCE($3, max_daily_patients)
         WHERE doctor_id = $1`, [docId, b.consultation_fee ?? null, b.max_daily_patients ?? null]);
    return { ok: true };
  });
});

// DELETE fails with a FK error (ON DELETE RESTRICT) if the doctor has appointments — by design
export const DELETE = route(['admin'], async ({ user, params }) => {
  const docId = id.parse(params.id);
  return withUser(user, async (c) => {
    const { rowCount } = await c.query('DELETE FROM users WHERE user_id = $1 AND role = \'doctor\'', [docId]);
    return { deleted: rowCount };
  });
});
