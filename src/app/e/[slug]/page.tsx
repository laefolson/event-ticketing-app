import { notFound } from 'next/navigation';

interface EventPageProps {
  params: Promise<{ slug: string }>;
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  
  // TODO: Fetch event by slug from Supabase
  // TODO: Return 404 if link_active = false
  // TODO: Render event landing page with hero, description, tiers, map, host bio, FAQ
  
  return (
    <div>
      <h1>Event: {slug}</h1>
      <p>Event landing page coming soon...</p>
    </div>
  );
}

export async function generateMetadata({ params }: EventPageProps) {
  const { slug } = await params;
  
  // TODO: Fetch event metadata
  // TODO: Add noindex meta tag
  
  return {
    title: 'Event',
    robots: {
      index: false,
      follow: false,
    },
  };
}
