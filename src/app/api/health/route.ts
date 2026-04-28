import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('events').select('id').limit(1);

    if (error) {
      return NextResponse.json(
        { status: 'error', error: error.message },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: 'error', error: 'Internal server error' },
      { status: 503 }
    );
  }
}
