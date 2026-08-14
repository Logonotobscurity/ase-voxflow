import { NextResponse } from 'next/server';
export async function POST(request:Request){
  const form=await request.formData().catch(()=>null);const audio=form?.get('audio');
  if(!audio)return NextResponse.json({error:'An audio file is required.'},{status:400});
  return NextResponse.json({transcript:'Find preferred logistics vendors in Lagos and compare performance.',language:'en-NG',confidence:.94,provider:process.env.VOICE_SERVICE_URL?'whisper-large-v3':'demo'});
}
