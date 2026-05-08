import { NextResponse } from 'next/server';

export async function GET() {
  const response = await fetch(
    `https://content.guardianapis.com/search` +
    `?q=artificial+intelligence` +
    `&order-by=newest` +
    `&page-size=50` +
    `&show-fields=headline,trailText,byline,sectionName` +
    `&api-key=${process.env.GUARDIAN_API_KEY}`
  );
  const data = await response.json();

  return NextResponse.json(data, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
