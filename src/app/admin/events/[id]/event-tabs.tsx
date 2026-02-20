'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface EventTabsProps {
  eventId: string;
}

const tabs = [
  { label: 'Details', href: '' },
  { label: 'Tiers', href: '/tiers' },
  { label: 'Contacts', href: '/contacts' },
  { label: 'Attendees', href: '/attendees' },
  { label: 'Post-Event', href: '/post-event' },
];

export function EventTabs({ eventId }: EventTabsProps) {
  const pathname = usePathname();
  const basePath = `/admin/events/${eventId}`;

  return (
    <div className="flex items-center gap-1 border-b">
      {tabs.map((tab) => {
        const tabPath = `${basePath}${tab.href}`;
        const isActive = tab.href === ''
          ? pathname === basePath
          : pathname.startsWith(tabPath);

        return (
          <Link
            key={tab.label}
            href={tabPath}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
