import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';

interface TicketPdfProps {
  eventTitle: string;
  dateFormatted: string;
  locationName: string | null;
  attendeeName: string;
  tierName: string;
  quantity: number;
  ticketCode: string;
  coverImageUrl: string | null;
}

const colors = {
  bg: '#fafaf9',        // stone-50
  text: '#1c1917',      // stone-900
  label: '#78716c',     // stone-500
  border: '#d6d3d1',    // stone-300
  accent: '#44403c',    // stone-700
  accentLight: '#57534e', // stone-600
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.bg,
    padding: 0,
    width: 420,
    height: 300,
  },
  coverImage: {
    width: '100%',
    height: 90,
    objectFit: 'cover',
  },
  accentBar: {
    width: '100%',
    height: 6,
    backgroundColor: colors.accent,
  },
  body: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 20,
  },
  label: {
    fontSize: 6,
    fontFamily: 'Helvetica',
    color: colors.label,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  eventTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: colors.text,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 8,
  },
  infoText: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: colors.accent,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderBottomStyle: 'dashed',
    marginVertical: 10,
  },
  grid: {
    flexDirection: 'row',
    gap: 32,
  },
  gridItem: {
    flex: 1,
  },
  gridValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: colors.text,
  },
  codeLabel: {
    fontSize: 6,
    fontFamily: 'Helvetica',
    color: colors.label,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  codeValue: {
    fontSize: 14,
    fontFamily: 'Courier-Bold',
    color: colors.text,
    letterSpacing: 2,
  },
});

export function TicketPdf({
  eventTitle,
  dateFormatted,
  locationName,
  attendeeName,
  tierName,
  quantity,
  ticketCode,
  coverImageUrl,
}: TicketPdfProps) {
  return (
    <Document>
      <Page size={{ width: 420, height: 300 }} style={styles.page}>
        {coverImageUrl ? (
          <Image src={coverImageUrl} style={styles.coverImage} />
        ) : (
          <View style={styles.accentBar} />
        )}

        <View style={styles.body}>
          <Text style={styles.label}>Event</Text>
          <Text style={styles.eventTitle}>{eventTitle}</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoText}>{dateFormatted}</Text>
            {locationName && (
              <Text style={styles.infoText}>{locationName}</Text>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Attendee</Text>
              <Text style={styles.gridValue}>{attendeeName}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Tier</Text>
              <Text style={styles.gridValue}>{tierName}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Qty</Text>
              <Text style={styles.gridValue}>{String(quantity)}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.codeLabel}>Ticket Code</Text>
          <Text style={styles.codeValue}>{ticketCode}</Text>
        </View>
      </Page>
    </Document>
  );
}
