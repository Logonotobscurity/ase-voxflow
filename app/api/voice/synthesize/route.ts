import { NextResponse } from 'next/server';
export async function POST(request:Request){const body=await request.json().catch(()=>null);if(!body?.text)return NextResponse.json({error:'Text is required.'},{status:400});return NextResponse.json({status:'queued',voice:body.voice||'ayo',language:body.language||'en-NG',audioUrl:'/demo/voice-response.mp3'});}
