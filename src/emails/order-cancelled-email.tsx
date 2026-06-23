import { Section, Text } from '@react-email/components';
import { BaseLayout } from './base-layout';

export interface OrderCancelledEmailProps {
  attendeeName: string;
  eventTitle: string;
  dateFormatted: string;
  venueName: string;
  bannerText?: string | null;
  reason?: string | null;
}

export function OrderCancelledEmail({
  attendeeName,
  eventTitle,
  dateFormatted,
  venueName,
  bannerText,
  reason,
}: OrderCancelledEmailProps) {
  return (
    <BaseLayout
      preview={`Your pending order for ${eventTitle} was cancelled`}
      venueName={venueName}
      bannerText={bannerText}
    >
      <Section>
        <Text style={greeting}>Hi {attendeeName},</Text>
        <Text style={body}>
          Your pending Venmo order for <strong>{eventTitle}</strong> on{' '}
          {dateFormatted} has been cancelled. No tickets were issued and you
          will not be charged.
        </Text>
        {reason && (
          <Text style={body}>
            <strong>Note:</strong> {reason}
          </Text>
        )}
        <Text style={body}>
          If you believe this was a mistake or you&apos;d like to try again,
          reply to this email and we&apos;ll help you out.
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
