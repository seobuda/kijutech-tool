import { redirect } from 'next/navigation';

// La portada no enseña nada: lleva al inicio de sesión (y de ahí al panel si ya hay sesión).
export default function HomePage() {
  redirect('/sign-in');
}
