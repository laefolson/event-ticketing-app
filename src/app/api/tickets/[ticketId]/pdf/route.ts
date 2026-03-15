import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { format } from 'date-fns';
import sharp from 'sharp';
import { createServiceClient } from '@/lib/supabase/service';
import { TicketPdf } from '@/lib/pdf/ticket-pdf';
import { generateQrDataUrl } from '@/lib/qr';

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

  const ticketQrEnabled = !!(event.ticket_qr_enabled);
  let qrDataUrl: string | undefined;
  if (ticketQrEnabled) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';
    const verifyUrl = `${baseUrl}/e/${event.slug}/verify/${ticket.ticket_code}`;
    qrDataUrl = await generateQrDataUrl(verifyUrl);
  }

  // react-pdf doesn't support WebP — convert cover image to PNG
  let coverImageSrc: string | null = null;
  const coverUrl = event.cover_image_url as string | null;
  if (coverUrl) {
    try {
      const res = await fetch(coverUrl);
      if (res.ok) {
        const imgBuffer = Buffer.from(await res.arrayBuffer());
        const pngBuffer = await sharp(imgBuffer).png().toBuffer();
        coverImageSrc = `data:image/png;base64,${pngBuffer.toString('base64')}`;
      }
    } catch {
      // Fall back to no cover image
    }
  }

  const pdfBuffer = await renderToBuffer(
    TicketPdf({
      eventTitle: event.title as string,
      dateFormatted,
      locationName: event.location_name as string | null,
      attendeeName: ticket.attendee_name as string,
      tierName,
      quantity: ticket.quantity as number,
      ticketCode: ticket.ticket_code as string,
      coverImageUrl: coverImageSrc,
      ticketQrEnabled,
      qrDataUrl,
    })
  );

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ticket-${ticket.ticket_code}.pdf"`,
    },
  });
}
