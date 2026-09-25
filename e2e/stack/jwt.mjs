// Mints the anon / service_role API keys the same way Supabase does:
// HS256 JWTs signed with the project's JWT secret.
import { createHmac } from 'node:crypto';

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

export const mintKey = (role, secret) => {
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ iss: 'supabase-e2e', role, iat: 1700000000, exp: 4102444800 });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
};

if (process.argv[2]) console.log(mintKey(process.argv[2], process.env.E2E_JWT_SECRET));
