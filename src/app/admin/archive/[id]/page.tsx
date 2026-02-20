export const dynamic = 'force-dynamic';

interface ArchiveDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ArchiveDetailPage({ params }: ArchiveDetailPageProps) {
  const { id } = await params;
  
  // TODO: Fetch archived event
  // TODO: Fetch tickets sold per tier, total revenue
  // TODO: Fetch attendance count (checked_in vs confirmed)
  // TODO: Render full attendee list with export CSV button
  // TODO: Display invitation stats, thank-you message stats, CSV import history
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Archived Event Details</h1>
      <p>Event ID: {id}</p>
      <p>Archive detail page with stats and attendee list coming soon...</p>
    </div>
  );
}
