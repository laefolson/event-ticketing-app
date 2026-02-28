import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { createServiceClient } from '@/lib/supabase/service';
import { TicketPdf } from '@/lib/pdf/ticket-pdf';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;

  const supabase = createServiceClient();

  // Fetch ticket with joined tier name
  const { data: ticketData } = await supabase
    .from('tickets')
    .select('*, ticket_tiers!inner(name)')
    .eq('id', ticketId)
    .single();

  if (!ticketData) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  const { ticket_tiers, ...ticket } = ticketData as Record<string, unknown> & {
    ticket_tiers: { name: string };
  };
  const tierName = ticket_tiers.name;

  // Fetch the event
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', ticket.event_id as string)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const dateFormatted = format(
    new Date(event.date_start as string),
    'EEEE, MMMM d, yyyy · h:mm a'
  );

  const pdfBuffer = await renderToBuffer(
    TicketPdf({
      eventTitle: event.title as string,
      dateFormatted,
      locationName: event.location_name as string | null,
      attendeeName: ticket.attendee_name as string,
      tierName,
      quantity: ticket.quantity as number,
      ticketCode: ticket.ticket_code as string,
      coverImageUrl: event.cover_image_url as string | null,
    })
  );

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ticket-${ticket.ticket_code}.pdf"`,
    },
  });
}
