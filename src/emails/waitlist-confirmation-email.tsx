import { Section, Text } from '@react-email/components';
import { BaseLayout } from './base-layout';

export interface WaitlistConfirmationEmailProps {
  firstName: string;
  eventTitle: string;
  venueName: string;
  bannerText?: string | null;
}

export function WaitlistConfirmationEmail({
  firstName,
  eventTitle,
  venueName,
  bannerText,
}: WaitlistConfirmationEmailProps) {
  return (
    <BaseLayout
      preview={`You're on the waitlist for ${eventTitle}`}
      venueName={venueName}
      bannerText={bannerText}
    >
      <Section>
        <Text style={greeting}>Hi {firstName},</Text>
        <Text style={body}>
          Thanks for your interest in <strong>{eventTitle}</strong>! You&rsquo;re
          on the waitlist — we&rsquo;ll reach out if additional tickets become
          available.
        </Text>
      </Section>
    </BaseLayout>
  );
}

const greeting: React.CSSProperties = {
  color: '#1c1917',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 16px 0',
};

const body: React.CSSProperties = {
  color: '#44403c',
  fontSize: '15px',
  lineHeight: '1.5',
  margin: '0 0 14px 0',
};
