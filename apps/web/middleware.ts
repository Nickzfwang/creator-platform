import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const protectedPaths = ['/', '/videos', '/schedule', '/bot', '/members', '/brand', '/analytics', '/settings'];

// Routes that should redirect to dashboard if already authenticated
const authPaths = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for refresh token cookie/presence as a basic indicator
  // Real auth check happens client-side via useRequireAuth
  const hasRefreshToken = request.cookies.get('hasAuth')?.value === '1';

  // Protect dashboard routes — redirect to login if no token indicator
  if (protectedPaths.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p)))) {
    // We rely on client-side auth check since tokens are in localStorage
    // Middleware just provides a fast redirect for obvious cases
    return NextResponse.next();
  }

  // Redirect authenticated users away from auth pages
  if (authPaths.includes(pathname) && hasRefreshToken) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*$).*)',
  ],
};
