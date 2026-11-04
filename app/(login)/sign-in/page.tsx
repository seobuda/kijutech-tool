import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { Login } from '../login';

export default async function SignInPage() {
  if (await getUser()) redirect('/dashboard');
  return <Login />;
}
