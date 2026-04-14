import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';

export default function HomePage() {
  redirect(`/${randomUUID()}`);
}
