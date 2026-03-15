import { Img, Section, Text } from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface TicketLine {
  tierName: string;
  quantity: number;
  ticketCode: string;
  qrDataUrl?: string;
}

interface TicketConfirmationEmailProps {
  attendeeName: string;
  eventTitle: string;
  dateFormatted: string;
  locationName: string | null;
  tickets: TicketLine[];
  amountPaidFormatted: string;
  venueName: string;
  ticketQrEnabled?: boolean;
}

export function TicketConfirmationEmail({
  attendeeName,
  eventTitle,
  dateFormatted,
  locationName,
  tickets,
  amountPaidFormatted,
  venueName,
  ticketQrEnabled,
}: TicketConfirmationEmailProps) {
  return (
    <BaseLayout preview={`Your tickets for ${eventTitle} are confirmed`} venueName={venueName}>
      <Text style={heading}>Payment Confirmed!</Text>
      <Text style={paragraph}>Hi {attendeeName},</Text>
      <Text style={paragraph}>
        Your purchase for <strong>{eventTitle}</strong> is complete. Here are
        your details:
      </Text>
      <Section style={detailsBox}>
        <Text style={detailLabel}>Event</Text>
        <Text style={detailValue}>{eventTitle}</Text>
        <Text style={detailLabel}>Date</Text>
        <Text style={detailValue}>{dateFormatted}</Text>
        {locationName && (
          <>
            <Text style={detailLabel}>Location</Text>
            <Text style={detailValue}>{locationName}</Text>
          </>
        )}
        <Text style={detailLabel}>Tickets</Text>
        {tickets.map((ticket, i) => (
          <React.Fragment key={i}>
            <Text style={detailValue}>
              {ticket.tierName} &times; {ticket.quantity}
            </Text>
            <Text style={detailLabel}>Ticket Code</Text>
            {ticketQrEnabled && ticket.qrDataUrl ? (
              <>
                <Img
                  src={ticket.qrDataUrl}
                  alt={`QR code for ${ticket.ticketCode}`}
                  width="120"
                  height="120"
                  style={{ margin: '4px 0 4px' }}
                />
                <Text style={i === tickets.length - 1 ? qrCodeTextLast : qrCodeTextStyle}>
                  {ticket.ticketCode}
                </Text>
              </>
            ) : (
              <Text style={i === tickets.length - 1 ? codeValueLast : codeValue}>
                {ticket.ticketCode}
              </Text>
            )}
            {i < tickets.length - 1 && <Text style={detailLabel}>---</Text>}
          </React.Fragment>
        ))}
        <Text style={detailLabel}>Amount Paid</Text>
        <Text style={detailValue}>{amountPaidFormatted}</Text>
      </Section>
      <Text style={paragraph}>
        Please save your ticket code{tickets.length > 1 ? 's' : ''}. You may need to present {tickets.length > 1 ? 'them' : 'it'} at the event.
      </Text>
    </BaseLayout>
  );
}

const heading: React.CSSProperties = {
  color: '#1c1917',
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: '1.3',
  margin: '0 0 16px',
};

const paragraph: React.CSSProperties = {
  color: '#44403c',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 12px',
};

const detailsBox: React.CSSProperties = {
  backgroundColor: '#fafaf9',
  border: '1px solid #e7e5e4',
  borderRadius: '6px',
  margin: '20px 0',
  padding: '16px 20px',
};

const detailLabel: React.CSSProperties = {
  color: '#78716c',
  fontSize: '12px',
  fontWeight: '600',
  letterSpacing: '0.05em',
  margin: '0 0 2px',
  textTransform: 'uppercase' as const,
};

const detailValue: React.CSSProperties = {
  color: '#1c1917',
  fontSize: '15px',
  fontWeight: '500',
  margin: '0 0 12px',
};

const codeValue: React.CSSProperties = {
  color: '#1c1917',
  fontFamily: 'monospace',
  fontSize: '18px',
  fontWeight: '700',
  letterSpacing: '0.05em',
  margin: '0 0 12px',
};

const codeValueLast: React.CSSProperties = {
  color: '#1c1917',
  fontFamily: 'monospace',
  fontSize: '18px',
  fontWeight: '700',
  letterSpacing: '0.05em',
  margin: '0',
};

const qrCodeTextStyle: React.CSSProperties = {
  color: '#78716c',
  fontFamily: 'monospace',
  fontSize: '13px',
  letterSpacing: '0.05em',
  margin: '0 0 12px',
};

const qrCodeTextLast: React.CSSProperties = {
  color: '#78716c',
  fontFamily: 'monospace',
  fontSize: '13px',
  letterSpacing: '0.05em',
  margin: '0',
};
