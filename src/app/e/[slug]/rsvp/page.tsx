interface RSVPPageProps {
  params: Promise<{ slug: string }>;
}

export default async function RSVPPage({ params }: RSVPPageProps) {
  const { slug } = await params;
  
  // TODO: Fetch event by slug
  // TODO: Verify event is free (all tiers have price_cents = 0)
  // TODO: Render RSVP form with name, email, phone fields
  // TODO: Validate max_per_contact server-side
  // TODO: Create ticket with status = confirmed, amount_paid_cents = 0
  // TODO: Redirect to /e/[slug]/confirm
  
  return (
    <div>
      <h1>RSVP for Event: {slug}</h1>
      <p>RSVP form coming soon...</p>
    </div>
  );
}
