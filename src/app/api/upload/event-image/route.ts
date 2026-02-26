import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const BUCKET = 'event-assets';

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const eventId = formData.get('eventId') as string | null;
  const type = formData.get('type') as string | null;

  if (!file || !eventId || !type) {
    return NextResponse.json(
      { error: 'Missing required fields: file, eventId, type' },
      { status: 400 }
    );
  }

  if (type !== 'cover' && type !== 'gallery') {
    return NextResponse.json(
      { error: 'Type must be "cover" or "gallery"' },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'File must be JPEG, PNG, or WebP' },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'File must be under 5MB' },
      { status: 400 }
    );
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const filename = `${type}-${Date.now()}.${ext}`;
  const storagePath = `${eventId}/${filename}`;

  const serviceClient = createServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await serviceClient.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('Storage upload failed:', uploadError.message);
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = serviceClient.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return NextResponse.json({ url: publicUrlData.publicUrl });
}
