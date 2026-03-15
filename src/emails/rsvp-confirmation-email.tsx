import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface TicketLine {
  tierName: string;
  quantity: number;
  ticketCode: string;
}

interface RsvpConfirmationEmailProps {
  attendeeName: string;
  eventTitle: string;
  dateFormatted: string;
  locationName: string | null;
  tickets: TicketLine[];
  venueName: string;
}

export function RsvpConfirmationEmail({
  attendeeName,
  eventTitle,
  dateFormatted,
  locationName,
  tickets,
  venueName,
}: RsvpConfirmationEmailProps) {
  return (
    <BaseLayout preview={`Your RSVP for ${eventTitle} is confirmed`} venueName={venueName}>
      <Text style={heading}>RSVP Confirmed!</Text>
      <Text style={paragraph}>Hi {attendeeName},</Text>
      <Text style={paragraph}>
        Your spot at <strong>{eventTitle}</strong> is reserved. Here are your
        details:
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
            <Text style={i === tickets.length - 1 ? codeValueLast : codeValue}>
              {ticket.ticketCode}
            </Text>
            {i < tickets.length - 1 && <Text style={detailLabel}>---</Text>}
          </React.Fragment>
        ))}
      </Section>
      <Text style={paragraph}>
        Please save your ticket code{tickets.length > 1 ? 's' : ''}. You may need to present {tickets.length > 1 ? 'them' : 'it'} at the event.
      </Text>
    </BaseLayout>
  );
}

const heading: React.CSSProperties = {
  color: '#633806',
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: '1.3',
  margin: '0 0 16px',
};

const paragraph: React.CSSProperties = {
  color: '#2c2a24',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 12px',
};

const detailsBox: React.CSSProperties = {
  backgroundColor: '#fdf9f0',
  border: '1px solid #e8e5da',
  borderRadius: '6px',
  margin: '20px 0',
  padding: '16px 20px',
};

const detailLabel: React.CSSProperties = {
  color: '#5f5c55',
  fontSize: '12px',
  fontWeight: '600',
  letterSpacing: '0.05em',
  margin: '0 0 2px',
  textTransform: 'uppercase' as const,
};

const detailValue: React.CSSProperties = {
  color: '#2c2a24',
  fontSize: '15px',
  fontWeight: '500',
  margin: '0 0 12px',
};

const codeValue: React.CSSProperties = {
  color: '#2c2a24',
  fontFamily: 'monospace',
  fontSize: '18px',
  fontWeight: '700',
  letterSpacing: '0.05em',
  margin: '0 0 12px',
};

const codeValueLast: React.CSSProperties = {
  color: '#2c2a24',
  fontFamily: 'monospace',
  fontSize: '18px',
  fontWeight: '700',
  letterSpacing: '0.05em',
  margin: '0',
};
