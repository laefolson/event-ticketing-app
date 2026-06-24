import { Button, Section, Text } from '@react-email/components';
import { BaseLayout } from './base-layout';

export interface WaitlistOfferEmailProps {
  firstName: string;
  eventTitle: string;
  dateFormatted: string;
  ticketsOffered: number;
  expiresFormatted: string;
  offerUrl: string;
  declineUrl: string;
  venueName: string;
  bannerText?: string | null;
}

export function WaitlistOfferEmail({
  firstName,
  eventTitle,
  dateFormatted,
  ticketsOffered,
  expiresFormatted,
  offerUrl,
  declineUrl,
  venueName,
  bannerText,
}: WaitlistOfferEmailProps) {
  return (
    <BaseLayout
      preview={`Tickets available — ${eventTitle}`}
      venueName={venueName}
      bannerText={bannerText}
    >
      <Section>
        <Text style={greeting}>Hi {firstName},</Text>
        <Text style={body}>
          Great news — we have <strong>{ticketsOffered}</strong> ticket
          {ticketsOffered === 1 ? '' : 's'} for you for{' '}
          <strong>{eventTitle}</strong> on {dateFormatted}.
        </Text>
        <Text style={body}>
          Complete your purchase by <strong>{expiresFormatted}</strong>:
        </Text>
        <Button href={offerUrl} style={button}>
          Reserve my tickets
        </Button>
        <Text style={small}>
          If you&rsquo;re no longer interested,{' '}
          <a href={declineUrl} style={link}>
            no thanks
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

const button: React.CSSProperties = {
  backgroundColor: '#5597bb',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600',
  padding: '12px 20px',
  textDecoration: 'none',
  display: 'inline-block',
  margin: '8px 0 16px 0',
};

const small: React.CSSProperties = {
  color: '#78716c',
  fontSize: '13px',
  margin: '12px 0 0 0',
};

const link: React.CSSProperties = {
  color: '#5597bb',
  textDecoration: 'underline',
};
