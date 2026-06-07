import { Section, Text, Button, Img } from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface EventUpdateEmailProps {
  firstName: string;
  eventTitle: string;
  eventUrl: string;
  venueName: string;
  bannerText?: string | null;
  headline: string | null;
  body: string;
  imageUrl: string | null;
}

/**
 * Broadcast email to confirmed/checked-in ticket holders. Pure
 * announcement: no purchase CTA, no "RSVP" prompt — these recipients
 * already have a ticket. Used for weather alerts, parking notes,
 * day-of logistics, and other event-time updates.
 */
export function EventUpdateEmail({
  firstName,
  eventTitle,
  eventUrl,
  venueName,
  bannerText,
  headline,
  body,
  imageUrl,
}: EventUpdateEmailProps) {
  return (
    <BaseLayout
      preview={headline ?? `Update: ${eventTitle}`}
      venueName={venueName}
      bannerText={bannerText}
    >
      <Text style={heading}>{headline ?? 'Event Update'}</Text>
      <Text style={paragraph}>Hi {firstName},</Text>
      {imageUrl && (
        <Section style={imageSection}>
          <Img
            src={imageUrl}
            alt={eventTitle}
            width="496"
            style={image}
          />
        </Section>
      )}
      {body.split(/\n{2,}/).map((para, i) => (
        <Text key={i} style={paragraph}>
          {para.split('\n').flatMap((line, j, arr) =>
            j < arr.length - 1 ? [line, <br key={`${i}-${j}`} />] : [line]
          )}
        </Text>
      ))}
      <Section style={ctaSection}>
        <Button style={ctaButton} href={eventUrl}>
          View Event Details
        </Button>
      </Section>
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

const imageSection: React.CSSProperties = {
  margin: '20px 0',
};

const image: React.CSSProperties = {
  borderRadius: '6px',
  maxWidth: '100%',
  height: 'auto',
};

const ctaSection: React.CSSProperties = {
  margin: '24px 0',
  textAlign: 'center' as const,
};

const ctaButton: React.CSSProperties = {
  backgroundColor: '#5597bb',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: '600',
  padding: '12px 32px',
  textDecoration: 'none',
};
