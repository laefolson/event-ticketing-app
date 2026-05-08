import { NextResponse } from 'next/server';

export async function GET() {
  const response = await fetch(
    `https://newsapi.org/v2/everything?q=artificial+intelligence` +
    `&sortBy=popularity&pageSize=50&language=en` +
    `&apiKey=${process.env.NEWS_API_KEY}`
  );
  const data = await response.json();

  return NextResponse.json(data, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
