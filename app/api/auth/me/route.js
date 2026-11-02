import { route } from '@/lib/api.mjs';
export const GET = route(['patient', 'doctor', 'admin'], async ({ user }) => ({ user }));
