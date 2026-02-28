import { Text } from '@react-email/components';
import * as React from 'react';
import { BaseLayout } from './base-layout';

interface ThankYouEmailProps {
  firstName: string;
  eventTitle: string;
  customBody: string;
  venueName: string;
}

export function ThankYouEmail({
  firstName,
  eventTitle,
  customBody,
  venueName,
}: ThankYouEmailProps) {
  return (
    <BaseLayout preview={`Thank you for attending ${eventTitle}`} venueName={venueName}>
      <Text style={heading}>Thank You!</Text>
      <Text style={paragraph}>Hi {firstName},</Text>
      {customBody.split('\n').map((line, i) => (
        <Text key={i} style={paragraph}>
          {line || '\u00A0'}
        </Text>
      ))}
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
