import { Section, Text, Button, Img } from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface InvitationEmailProps {
  firstName: string;
  eventTitle: string;
  eventUrl: string;
  venueName: string;
  bannerText?: string | null;
  introText: string | null;
  imageUrl: string | null;
  afterImageText: string | null;
  isFreeEvent: boolean;
}

export function InvitationEmail({
  firstName,
  eventTitle,
  eventUrl,
  venueName,
  bannerText,
  introText,
  imageUrl,
  afterImageText,
  isFreeEvent,
}: InvitationEmailProps) {
  const buttonLabel = isFreeEvent
    ? 'RSVP'
    : 'View Event & Purchase Tickets';

  return (
    <BaseLayout
      preview={`You're invited to ${eventTitle}`}
      venueName={venueName}
      bannerText={bannerText}
    >
      <Text style={heading}>You&apos;re Invited!</Text>
      <Text style={paragraph}>Hi {firstName},</Text>
      {introText ? (
        <Text style={paragraph}>{introText}</Text>
      ) : (
        <Text style={paragraph}>
          We&apos;d love for you to join us at <strong>{eventTitle}</strong>.
        </Text>
      )}
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
      {afterImageText && <Text style={paragraph}>{afterImageText}</Text>}
      <Section style={ctaSection}>
        <Button style={ctaButton} href={eventUrl}>
          {buttonLabel}
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

const footnote: React.CSSProperties = {
  color: '#b4b2a9',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '16px 0 0',
  wordBreak: 'break-all' as const,
};
