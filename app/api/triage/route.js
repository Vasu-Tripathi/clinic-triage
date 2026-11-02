// Core feature: free-text symptoms -> embedding -> pgvector similarity -> top-3 doctors.
import { z } from 'zod';
import { route } from '@/lib/api.mjs';
import { withUser } from '@/lib/db.mjs';
import { embed, toPgVector } from '@/lib/embed.mjs';
import { isRedFlag } from '@/lib/validators.mjs';

export const runtime = 'nodejs';

const schema = z.object({
  description: z.string().trim().min(10, 'describe your symptoms in a little more detail').max(2000),
  severity: z.coerce.number().int().min(1).max(10),
  duration_days: z.coerce.number().int().min(0).max(3650),
  branch_id: z.coerce.number().int().positive().optional().nullable(),
});

export const POST = route(['patient'], async ({ req, user }) => {
  const b = schema.parse(await req.json());
  const [vec] = await embed(b.description);
  const v = toPgVector(vec);
  const redFlag = isRedFlag(b.description, b.severity);

  return withUser(user, async (c) => {
    const { rows: [report] } = await c.query(
      `INSERT INTO symptom_reports(patient_id, description, severity, duration_days, embedding, red_flag)
       VALUES (app_uid(), $1, $2, $3, $4::vector, $5) RETURNING report_id, created_at`,
      [b.description, b.severity, b.duration_days, v, redFlag]);

    const { rows: doctors } = await c.query(
      'SELECT * FROM fn_recommend_doctors($1::vector, 3, $2)', [v, b.branch_id ?? null]);

    for (const [i, d] of doctors.entries())
      await c.query('INSERT INTO triage_recommendations(report_id, rank, doctor_id, similarity) VALUES ($1,$2,$3,$4)',
        [report.report_id, i + 1, d.doctor_id, d.similarity]);

    // contrast: what a plain keyword (full-text) search would have found
    const { rows: keyword } = await c.query(
      `SELECT d.doctor_id, u.full_name, s.name AS specialization,
              ts_rank(d.search_tsv, plainto_tsquery('english', $1)) AS rank
       FROM doctors d JOIN users u ON u.user_id = d.doctor_id JOIN specializations s USING (spec_id)
       WHERE d.search_tsv @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC LIMIT 3`, [b.description]);

    const { rows: similarCases } = await c.query(
      'SELECT * FROM fn_similar_case_specialties($1::vector, 10)', [v]);

    return { report_id: report.report_id, red_flag: redFlag, doctors, keyword, similar_cases: similarCases };
  });
});
