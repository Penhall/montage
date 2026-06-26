import { NextResponse, type NextRequest } from "next/server";

const TOKEN_COOKIE = "montage_token";

// Protected routes that require authentication
const protectedPaths = ["/dashboard", "/videos", "/settings"];
// Auth pages — redirect logged-in users away from these
const authPaths = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
  const isAuthPage = authPaths.some((p) => pathname === p);

  // If no token and path is protected → redirect to /login
  if (!token && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // If has token and on auth page → redirect to /dashboard
  if (token && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
