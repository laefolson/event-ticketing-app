import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') || 'NVDA';
  const response = await fetch(
    `https://www.alphavantage.co/query` +
    `?function=TIME_SERIES_WEEKLY_ADJUSTED` +
    `&symbol=${symbol}` +
    `&apikey=${process.env.ALPHA_VANTAGE_KEY}`
  );
  const data = await response.json();

  return NextResponse.json(data, { headers: corsHeaders });
}
