export const dynamic = 'force-dynamic';

interface PostEventPageProps {
  params: Promise<{ id: string }>;
}

export default async function PostEventPage({ params }: PostEventPageProps) {
  const { id } = await params;
  
  // TODO: Fetch event and verify date_end < now()
  // TODO: Show disabled/countdown state if event hasn't ended
  // TODO: Render thank-you message composer (email + SMS)
  // TODO: Add "Send Thank-You Messages" button
  // TODO: Add "Archive Event" button
  // TODO: Handle archive action (sets status = archived, link_active = false)
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Post-Event Actions</h1>
      <p>Event ID: {id}</p>
      <p>Post-event thank-you messages and archive coming soon...</p>
    </div>
  );
}
