import { NextResponse } from "next/server";
import { getCurrentUser, getUserFromDb, sessionCookieOptions, AUTH_COOKIE } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const dbUser = getUserFromDb(user.id);
    if (!dbUser) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role, points: dbUser.points || 0 },
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_COOKIE, "", sessionCookieOptions(0));
  return response;
}
