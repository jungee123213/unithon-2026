import { NextResponse } from 'next/server';
import { authClient } from '@/lib/auth-server';

export async function POST(req: Request) {
  const db = await authClient();
  await db.auth.signOut();
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 });
}
