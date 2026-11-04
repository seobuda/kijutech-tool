import { getSafeUser } from '@/lib/db/queries';

// Solo lo que la interfaz necesita: nunca el hash de la contraseña ni la cuenta (tenant).
export async function GET() {
  const user = await getSafeUser();
  return Response.json(user);
}
