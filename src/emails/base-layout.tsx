import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Img,
  Preview,
} from '@react-email/components';
import * as React from 'react';

interface BaseLayoutProps {
  preview?: string;
  venueName: string;
  children: React.ReactNode;
}

export function BaseLayout({ preview, venueName, children }: BaseLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={headerText}>{venueName}</Text>
          </Section>
          <Section style={content}>{children}</Section>
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} {venueName}. All rights
              reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: '#fdf9f0',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e8e5da',
  borderRadius: '8px',
  margin: '40px auto',
  maxWidth: '560px',
  padding: '0',
};

const header: React.CSSProperties = {
  backgroundColor: '#5597bb',
  borderRadius: '8px 8px 0 0',
  padding: '24px 32px',
};

const headerText: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: '700',
  letterSpacing: '-0.02em',
  margin: 0,
};

const content: React.CSSProperties = {
  padding: '32px',
};

const divider: React.CSSProperties = {
  borderColor: '#e8e5da',
  borderTop: '1px solid #e8e5da',
  margin: '0',
};

const footer: React.CSSProperties = {
  padding: '20px 32px',
};

const footerText: React.CSSProperties = {
  color: '#b4b2a9',
  fontSize: '12px',
  margin: 0,
  textAlign: 'center' as const,
};
