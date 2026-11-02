-- =====================================================================
--  06_vector_commands.sql — pgvector usage (store, index, search, update, delete)
-- =====================================================================
\pset border 2
-- the vector columns and their indexes
SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE udt_name = 'vector';
SELECT indexname, indexdef FROM pg_indexes WHERE indexdef ILIKE '%hnsw%';

-- dimensionality / norm of stored embeddings (vectors are L2-normalised)
SELECT u.full_name, vector_dims(d.notes_embedding) AS dims, round(vector_norm(d.notes_embedding)::numeric, 4) AS l2_norm
FROM doctors d JOIN users u ON u.user_id = d.doctor_id LIMIT 3;

-- READ: k-NN search — cosine distance operator <=>, similarity = 1 - distance
--  (query = the embedding the app stored for a patient's free-text symptoms)
SELECT sr.report_id, left(sr.description, 60) AS symptoms FROM symptom_reports sr WHERE sr.report_id = 3;
SELECT u.full_name, s.name AS specialization,
       round((1 - (d.notes_embedding <=> q.embedding))::numeric, 4) AS cosine_similarity
FROM doctors d
JOIN users u ON u.user_id = d.doctor_id
JOIN specializations s ON s.spec_id = d.spec_id,
     (SELECT embedding FROM symptom_reports WHERE report_id = 3) q
ORDER BY d.notes_embedding <=> q.embedding
LIMIT 3;

-- same search wrapped in the stored function used by the API (with load-aware re-rank)
SELECT * FROM fn_recommend_doctors((SELECT embedding FROM symptom_reports WHERE report_id = 6), 3, NULL);

-- branch-filtered vector search (metadata filter + similarity)
SELECT doctor_id, full_name, specialization, branch, similarity
FROM fn_recommend_doctors((SELECT embedding FROM symptom_reports WHERE report_id = 6), 3,
                          (SELECT branch_id FROM branches WHERE name = 'Whitefield Clinic'));

-- nearest past cases -> aggregated specialisations (privacy-preserving)
SELECT * FROM fn_similar_case_specialties((SELECT embedding FROM symptom_reports WHERE report_id = 1), 10);

-- query plan: HNSW approximate nearest-neighbour index scan
SET enable_seqscan = off;
EXPLAIN (COSTS OFF)
SELECT doctor_id FROM doctors
ORDER BY notes_embedding <=> (SELECT embedding FROM symptom_reports WHERE report_id = 1) LIMIT 3;
RESET enable_seqscan;

-- UPDATE / DELETE of vector data (done by the app when notes change or a report is withdrawn)
BEGIN;
UPDATE doctors SET notes_embedding = (SELECT embedding FROM symptom_reports WHERE report_id = 1), embedded_at = now()
WHERE doctor_id = (SELECT user_id FROM users WHERE email = 'priya.nair@demo.clinic')
RETURNING doctor_id, vector_dims(notes_embedding), embedded_at;
DELETE FROM symptom_reports WHERE report_id = 16 RETURNING report_id;
ROLLBACK;

-- semantic vs keyword: full-text search finds nothing for lay phrasing
SELECT count(*) AS fts_hits FROM doctors
WHERE search_tsv @@ plainto_tsquery('english', 'itchy red patches on my elbows that flake off');
