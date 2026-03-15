import { Section, Text, Img } from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface SaveTheDateEmailProps {
  firstName: string;
  eventTitle: string;
  imageUrl: string | null;
  additionalText: string | null;
  venueName: string;
}

export function SaveTheDateEmail({
  firstName,
  eventTitle,
  imageUrl,
  additionalText,
  venueName,
}: SaveTheDateEmailProps) {
  return (
    <BaseLayout preview={`Save the Date: ${eventTitle}`} venueName={venueName}>
      <Text style={heading}>Save the Date!</Text>
      <Text style={paragraph}>Hi {firstName},</Text>
      <Text style={paragraph}>
        Mark your calendar for <strong>{eventTitle}</strong>. More details coming
        soon!
      </Text>
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
      {additionalText && <Text style={paragraph}>{additionalText}</Text>}
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
