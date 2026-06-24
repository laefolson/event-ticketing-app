import { Section, Text } from '@react-email/components';
import { BaseLayout } from './base-layout';

export interface WaitlistOfferExpiredEmailProps {
  firstName: string;
  eventTitle: string;
  eventUrl: string;
  venueName: string;
  bannerText?: string | null;
}

export function WaitlistOfferExpiredEmail({
  firstName,
  eventTitle,
  eventUrl,
  venueName,
  bannerText,
}: WaitlistOfferExpiredEmailProps) {
  return (
    <BaseLayout
      preview={`Your ticket offer for ${eventTitle} has expired`}
      venueName={venueName}
      bannerText={bannerText}
    >
      <Section>
        <Text style={greeting}>Hi {firstName},</Text>
        <Text style={body}>
          Your ticket offer for <strong>{eventTitle}</strong> has expired. If
          you&rsquo;re still interested, you can rejoin the waitlist at{' '}
          <a href={eventUrl} style={link}>
            {eventUrl}
          </a>
          .
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

const link: React.CSSProperties = {
  color: '#5597bb',
  textDecoration: 'underline',
};
