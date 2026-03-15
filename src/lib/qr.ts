import QRCode from 'qrcode';

export async function generateQrDataUrl(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#1c1917', // stone-900
      light: '#ffffff',
    },
  });
}
