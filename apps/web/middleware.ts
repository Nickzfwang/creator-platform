import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Routes that should redirect to dashboard if already authenticated
const authPaths = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Run next-intl middleware first (handles locale detection & routing)
  const response = intlMiddleware(request);

  // Redirect authenticated users away from auth pages
  const hasRefreshToken = request.cookies.get('hasAuth')?.value === '1';
  if (authPaths.some((p) => pathname === p || pathname.endsWith(p)) && hasRefreshToken) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
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
