export const dynamic = 'force-dynamic';

interface AttendeesPageProps {
  params: Promise<{ id: string }>;
}

export default async function AttendeesPage({ params }: AttendeesPageProps) {
  const { id } = await params;
  
  // TODO: Fetch event and all tickets
  // TODO: Render searchable attendees list
  // TODO: Add manual check-in toggle
  // TODO: Add walk-in ticket creation form
  // TODO: Display live counter (checked in / expected)
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Attendees</h1>
      <p>Event ID: {id}</p>
      <p>Attendees list and check-in coming soon...</p>
    </div>
  );
}
