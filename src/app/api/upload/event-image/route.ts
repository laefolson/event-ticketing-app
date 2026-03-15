import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const COVER_WIDTH = 1200;
const COVER_HEIGHT = 400;

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

  // Verify user is a team member
  const { data: member } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  const serviceClient = createServiceClient();
  let buffer = Buffer.from(await file.arrayBuffer());
  let contentType = file.type;
  let ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';

  // Process cover images: resize/crop to 1200x400 WebP
  if (type === 'cover') {
    const metadata = await sharp(buffer).metadata();
    const srcW = metadata.width ?? COVER_WIDTH;
    const srcH = metadata.height ?? COVER_HEIGHT;

    const scale = Math.max(COVER_WIDTH / srcW, COVER_HEIGHT / srcH);
    const resizedW = Math.round(srcW * scale);
    const resizedH = Math.round(srcH * scale);

    const left = Math.round((resizedW - COVER_WIDTH) * 0.5);
    const top = Math.round((resizedH - COVER_HEIGHT) * 0.2);

    buffer = await sharp(buffer)
      .resize(resizedW, resizedH)
      .extract({ left, top, width: COVER_WIDTH, height: COVER_HEIGHT })
      .webp({ quality: 85 })
      .toBuffer() as Buffer<ArrayBuffer>;

    ext = 'webp';
    contentType = 'image/webp';
  }

  const filename = `${type}-${Date.now()}.${ext}`;
  const storagePath = `${eventId}/${filename}`;

  const { error: uploadError } = await serviceClient.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
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
