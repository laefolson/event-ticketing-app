import Link from 'next/link';
import { MessageSquare, ShieldCheck, Ban, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SMS Opt-In — Over Yonder Farm Events',
  description:
    'Learn how SMS messaging works when purchasing tickets for Over Yonder Farm events. SMS is always optional.',
  robots: { index: true, follow: true },
};

export default function SmsOptInPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="mx-auto max-w-3xl px-6 py-6 sm:px-8">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Over Yonder Farm
          </p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
            SMS Messaging Opt-In
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 sm:px-8 space-y-12">
        {/* Intro */}
        <section>
          <p className="text-lg leading-relaxed text-muted-foreground">
            When you purchase tickets or RSVP for an event at Over Yonder Farm,
            you may choose to receive text messages about your event or future
            events.{' '}
            <strong className="text-foreground">
              SMS messaging is entirely optional
            </strong>{' '}
            and is never required to purchase tickets or attend an event.
          </p>
        </section>

        {/* How it works */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">How SMS Opt-In Works</h2>

          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                1
              </div>
              <div>
                <h3 className="font-medium">You find an event</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  You receive an invitation link to a private event page at
                  events.yonderfarm.com. From there you can view event details
                  and choose to get tickets or RSVP.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                2
              </div>
              <div>
                <h3 className="font-medium">You enter your information</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  During checkout or RSVP, you provide your name, email, and
                  optionally your phone number. Providing a phone number is not
                  required.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                3
              </div>
              <div>
                <h3 className="font-medium">You choose your SMS preferences</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  If you enter a phone number, two optional checkboxes appear.
                  Each is unchecked by default — you must actively opt in by
                  checking the box. You can choose one, both, or neither:
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Consent types */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">
            Types of SMS Messages
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold">Event Updates</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Messages related to the specific event you are attending —
                  order confirmations, event reminders, day-of logistics, and
                  material event updates.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Typical frequency: 2–4 messages per event
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold">Future Event Announcements</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Messages about upcoming events, new event announcements, and
                  seasonal programming from Over Yonder Farm.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Typical frequency: no more than 1 message per month
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Key points */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Key Points</h2>

          <div className="space-y-4">
            <div className="flex gap-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h3 className="font-medium">SMS is never required</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can purchase tickets and attend events without providing a
                  phone number or opting in to any text messages.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h3 className="font-medium">Opt-in is explicit</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Both checkboxes are unchecked by default. You must actively
                  check a box to consent. Your consent, including the exact
                  checkbox text, timestamp, and IP address, is recorded.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Ban className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h3 className="font-medium">Opt out anytime</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reply <strong>STOP</strong> to any message to immediately stop
                  receiving texts. You can also reply <strong>HELP</strong> for
                  assistance.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <h3 className="font-medium">Message and data rates may apply</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Standard message and data rates from your wireless carrier may
                  apply.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Sample opt-in UI */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold">
            What the Opt-In Looks Like
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Below is an example of the opt-in checkboxes as they appear during
            checkout. Both are unchecked by default.
          </p>

          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Mock checkbox 1 */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-input" />
                <div>
                  <p className="text-sm leading-tight">
                    I agree to receive text messages about this event
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    By checking this box, you consent to receive text messages
                    from Over Yonder Farm regarding your ticket purchase and the
                    event you are attending. Messages may include order
                    confirmations, event reminders, day-of logistics, and
                    material event updates. Message frequency varies per event,
                    typically 2–4 messages per event. Message and data rates may
                    apply. Reply STOP to opt out at any time.
                  </p>
                </div>
              </div>

              {/* Mock checkbox 2 */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-input" />
                <div>
                  <p className="text-sm leading-tight">
                    I agree to receive text messages about future events from
                    Over Yonder Farm
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    By checking this box, you consent to receive text messages
                    from Over Yonder Farm about upcoming events, new event
                    announcements, and seasonal programming. Message frequency
                    varies, typically no more than 1 message per month. Message
                    and data rates may apply. Reply STOP to opt out at any time.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Links */}
        <section className="border-t pt-8">
          <h2 className="mb-4 text-xl font-semibold">More Information</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href="https://www.yonderfarm.com/privacy-policy"
                className="text-foreground underline underline-offset-4 hover:text-muted-foreground"
              >
                Privacy Policy
              </a>{' '}
              — how we collect, use, and protect your information
            </li>
            <li>
              <Link
                href="/terms"
                className="text-foreground underline underline-offset-4 hover:text-muted-foreground"
              >
                Terms and Conditions
              </Link>
            </li>
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">
            For questions about SMS messaging, contact us at{' '}
            <a
              href="mailto:events@yonderfarm.com"
              className="underline hover:text-foreground"
            >
              events@yonderfarm.com
            </a>
            .
          </p>
        </section>

        {/* Footer */}
        <footer className="border-t pt-6 pb-10 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Over Yonder Farm. All rights
          reserved.
        </footer>
      </main>
    </div>
  );
}
