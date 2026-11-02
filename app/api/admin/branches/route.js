import { z } from 'zod';
import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';

const schema = z.object({
  name: z.string().trim().min(3).max(80), street: z.string().trim().min(5).max(150),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/), phone: z.string().regex(/^\+?[0-9]{10,13}$/),
  opens_at: z.string().regex(/^\d{2}:\d{2}$/), closes_at: z.string().regex(/^\d{2}:\d{2}$/),
});
export const POST = route(['admin'], async ({ req, user }) => {
  const b = schema.parse(await req.json());
  return withUser(user, async (c) => (await c.query(
    `INSERT INTO branches(name, street, pincode, phone, opens_at, closes_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [b.name, b.street, b.pincode, b.phone, b.opens_at, b.closes_at])).rows[0]);
});
