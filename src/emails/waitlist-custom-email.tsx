import { Section, Text } from '@react-email/components';
import { BaseLayout } from './base-layout';

export interface WaitlistCustomEmailProps {
  body: string;
  venueName: string;
  bannerText?: string | null;
  previewText?: string;
}

export function WaitlistCustomEmail({
  body,
  venueName,
  bannerText,
  previewText,
}: WaitlistCustomEmailProps) {
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  return (
    <BaseLayout
      preview={previewText ?? body.slice(0, 120)}
      venueName={venueName}
      bannerText={bannerText}
    >
      <Section>
        {paragraphs.map((p, i) => (
          <Text key={i} style={paragraph}>
            {p}
          </Text>
        ))}
      </Section>
    </BaseLayout>
  );
}

const paragraph: React.CSSProperties = {
  color: '#2c2a24',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 14px',
  whiteSpace: 'pre-wrap',
};
