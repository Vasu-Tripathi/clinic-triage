import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { publicQuery } from '@/lib/db.mjs';
import { signSession, COOKIE, cookieOptions } from '@/lib/auth.mjs';
import { route } from '@/lib/api.mjs';
import { email, password, phone, isoDate } from '@/lib/validators.mjs';

const schema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email, password, phone,
  date_of_birth: isoDate,
  gender: z.enum(['male', 'female', 'other']),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '']).optional(),
});

export const POST = route(null, async ({ req }) => {
  const b = schema.parse(await req.json());
  const hash = await bcrypt.hash(b.password, 10);
  const { rows } = await publicQuery('SELECT fn_register_patient($1,$2,$3,$4,$5,$6,$7) AS id',
    [b.email, hash, b.full_name, b.phone ?? '', b.date_of_birth, b.gender, b.blood_group ?? '']);
  const user = { id: rows[0].id, role: 'patient', name: b.full_name };
  const res = NextResponse.json({ user }, { status: 201 });
  res.cookies.set(COOKIE, await signSession(user), cookieOptions);
  return res;
});
