'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

type MFAStep = 'loading' | 'enroll' | 'challenge';

function MFAForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/admin';

  const [step, setStep] = useState<MFAStep>('loading');
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [factorId, setFactorId] = useState<string>('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    checkMFAStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function checkMFAStatus() {
    const { data: aalData, error: aalError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (aalError) {
      router.replace('/auth/login');
      return;
    }

    // Already at AAL2 — go to admin
    if (aalData.currentLevel === 'aal2') {
      router.replace(redirectTo);
      return;
    }

    // Has a verified TOTP factor — show challenge
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const totpFactors =
      factorsData?.totp?.filter((f) => f.status === 'verified') ?? [];

    if (totpFactors.length > 0) {
      // Use first verified TOTP factor for challenge
      setFactorId(totpFactors[0].id);
      setStep('challenge');
    } else {
      // No verified TOTP factor — start enrollment
      await startEnrollment();
    }
  }

  async function startEnrollment() {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Authenticator App',
    });

    if (error || !data) {
      setError('Failed to start MFA enrollment. Please try again.');
      return;
    }

    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setStep('enroll');
  }

  async function verifyCode() {
    if (code.length !== 6) return;

    setIsPending(true);
    setError(null);

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError) {
      setError('Failed to create MFA challenge. Please try again.');
      setIsPending(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });

    if (verifyError) {
      setError('Invalid code. Please try again.');
      setCode('');
      setIsPending(false);
      return;
    }

    // MFA verified — redirect to admin
    router.replace(redirectTo);
  }

  if (step === 'loading') {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Checking authentication...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          {step === 'enroll' ? 'Set Up MFA' : 'Verify MFA'}
        </CardTitle>
        <CardDescription>
          {step === 'enroll'
            ? 'Scan the QR code with your authenticator app'
            : 'Enter the 6-digit code from your authenticator app'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 'enroll' && (
          <>
            <div className="flex justify-center">
              {/* QR code is returned as a data URI from Supabase */}
              <img
                src={qrCode}
                alt="MFA QR Code"
                className="h-48 w-48 rounded-lg border"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground text-center">
                Can&apos;t scan? Enter this key manually:
              </p>
              <p className="font-mono text-xs text-center break-all select-all bg-muted px-3 py-2 rounded-md">
                {secret}
              </p>
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="mfa-code">Verification Code</Label>
          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => setCode(value)}
              onComplete={verifyCode}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <Button
          onClick={verifyCode}
          className="w-full"
          disabled={isPending || code.length !== 6}
        >
          {isPending
            ? 'Verifying...'
            : step === 'enroll'
              ? 'Complete Setup'
              : 'Verify'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function MFAPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense
        fallback={
          <Card className="w-full max-w-sm">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Loading...</p>
            </CardContent>
          </Card>
        }
      >
        <MFAForm />
      </Suspense>
    </div>
  );
}
