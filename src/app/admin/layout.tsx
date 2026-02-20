import { ReactNode } from 'react';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { logout } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen">
      <nav className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-bold">
              Barn Events
            </Link>
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <Link
                href="/admin/events"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Events
              </Link>
              <Link
                href="/admin/archive"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Archive
              </Link>
              <Link
                href="/admin/team"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Team
              </Link>
              <Link
                href="/admin/settings"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>
          <form action={logout}>
            <Button variant="ghost" size="sm" type="submit">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </form>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
