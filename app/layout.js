import './globals.css';
export const metadata = { title: 'TriageCare — Symptom-to-Specialist', description: 'AI clinic triage on PostgreSQL + pgvector' };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
