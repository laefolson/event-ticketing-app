export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

interface CheckoutPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tier_id?: string; quantity?: string }>;
}

export default async function CheckoutPage({ 
  params, 
  searchParams 
}: CheckoutPageProps) {
  const { slug } = await params;
  const { tier_id, quantity } = await searchParams;
  
  // TODO: Fetch event and tier from Supabase
  // TODO: Validate max_per_contact server-side
  // TODO: Create Stripe Checkout Session
  // TODO: Redirect to Stripe Checkout URL
  
  // Placeholder redirect
  redirect(`/e/${slug}`);
}
