import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface RsvpConfirmationEmailProps {
  attendeeName: string;
  eventTitle: string;
  dateFormatted: string;
  locationName: string | null;
  tierName: string;
  quantity: number;
  ticketCode: string;
  venueName: string;
}

export function RsvpConfirmationEmail({
  attendeeName,
  eventTitle,
  dateFormatted,
  locationName,
  tierName,
  quantity,
  ticketCode,
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
        <Text style={detailLabel}>Tier</Text>
        <Text style={detailValue}>
          {tierName} &times; {quantity}
        </Text>
        <Text style={detailLabel}>Ticket Code</Text>
        <Text style={codeValue}>{ticketCode}</Text>
      </Section>
      <Text style={paragraph}>
        Please save your ticket code. You may need to present it at the event.
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
  margin: '0',
};
