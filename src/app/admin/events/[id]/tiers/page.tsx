interface TicketTiersPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketTiersPage({ params }: TicketTiersPageProps) {
  const { id } = await params;
  
  // TODO: Fetch event and ticket tiers
  // TODO: Render tiers list with edit/delete actions
  // TODO: Add "Create Tier" form
  // TODO: Handle Stripe Product/Price creation for paid tiers
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Manage Ticket Tiers</h1>
      <p>Event ID: {id}</p>
      <p>Ticket tiers management coming soon...</p>
    </div>
  );
}
