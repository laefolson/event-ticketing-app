import { Section, Text, Button } from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface InvitationEmailProps {
  firstName: string;
  eventTitle: string;
  dateFormatted: string;
  locationName: string | null;
  eventUrl: string;
  venueName: string;
}

export function InvitationEmail({
  firstName,
  eventTitle,
  dateFormatted,
  locationName,
  eventUrl,
  venueName,
}: InvitationEmailProps) {
  return (
    <BaseLayout preview={`You're invited to ${eventTitle}`} venueName={venueName}>
      <Text style={heading}>You&apos;re Invited!</Text>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        We&apos;d love for you to join us at <strong>{eventTitle}</strong>.
      </Text>
      <Section style={detailsBox}>
        <Text style={detailLabel}>Date</Text>
        <Text style={detailValue}>{dateFormatted}</Text>
        {locationName && (
          <>
            <Text style={detailLabel}>Location</Text>
            <Text style={detailValue}>{locationName}</Text>
          </>
        )}
      </Section>
      <Section style={ctaSection}>
        <Button style={ctaButton} href={eventUrl}>
          View Event &amp; RSVP
        </Button>
      </Section>
      <Text style={footnote}>
        If the button above doesn&apos;t work, copy and paste this link into
        your browser: {eventUrl}
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

const ctaSection: React.CSSProperties = {
  margin: '24px 0',
  textAlign: 'center' as const,
};

const ctaButton: React.CSSProperties = {
  backgroundColor: '#1c1917',
  borderRadius: '6px',
  color: '#fafaf9',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: '600',
  padding: '12px 32px',
  textDecoration: 'none',
};

const footnote: React.CSSProperties = {
  color: '#a8a29e',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '16px 0 0',
  wordBreak: 'break-all' as const,
};
