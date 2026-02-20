export default async function EventsPage() {
  // TODO: Fetch all events (draft, published, archived)
  // TODO: Render events list with filters (draft/published/archived)
  // TODO: Add "Create Event" button linking to /admin/events/new
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <a 
          href="/admin/events/new"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create Event
        </a>
      </div>
      <p>Events list coming soon...</p>
    </div>
  );
}
