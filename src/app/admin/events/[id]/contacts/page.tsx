export const dynamic = 'force-dynamic';

interface ContactsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ContactsPage({ params }: ContactsPageProps) {
  const { id } = await params;
  
  // TODO: Fetch event and contacts
  // TODO: Render CSV upload component
  // TODO: Render contacts list with invitation status
  // TODO: Add bulk channel configuration
  // TODO: Add send invitation buttons (email/SMS)
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Manage Contacts</h1>
      <p>Event ID: {id}</p>
      <p>Contacts management and CSV upload coming soon...</p>
    </div>
  );
}
