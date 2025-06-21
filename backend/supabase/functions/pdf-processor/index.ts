import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Налаштування API
const grokApiKey = Deno.env.get('GROK_API_KEY')!;
const ttsApiKey = Deno.env.get('TTS_API_KEY')!; // Наприклад, ElevenLabs
const pdfcoApiKey = Deno.env.get('PDF_API_KEY')!;
console.log('PDF.co API Key (raw):', pdfcoApiKey);
if (!pdfcoApiKey || pdfcoApiKey.length < 20) {
  console.error('PDF.co API Key is invalid or too short!');
}

serve(async (req: Request) => {
  const headers = new Headers();
  headers.append('Access-Control-Allow-Origin', 'http://localhost:5173');
  headers.append('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.append('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info, apikey');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  console.log('Received request:', req.method, req.url);

  try {
    if (req.method !== 'POST') {
      console.log('Method not allowed:', req.method);
      return new Response('Method not allowed', { status: 405, headers });
    }

    const { filePath } = await req.json();
    console.log('Extracted filePath:', filePath);

    const { data: fileData, error: fileError } = await supabase.storage
      .from('pdf-files')
      .download(filePath);
    console.log('Storage download attempt completed:', { fileError });

    if (fileError) {
      console.log('Storage download error:', fileError.message);
      return new Response(JSON.stringify({ error: fileError.message }), { status: 400, headers });
    }

    const buffer = await fileData.arrayBuffer();
    console.log('File buffer created, size:', buffer.byteLength);

    if (buffer.byteLength > 10 * 1024 * 1024) { // Перевірка розміру (10 MB)
      throw new Error('File size exceeds 10 MB limit for PDF.co');
    }

    // Створення FormData для завантаження
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'application/pdf' });
    formData.append('file', blob, 'uploaded.pdf');

    // Завантаження файлу в PDF.co
    const uploadResponse = await fetch('https://api.pdf.co/v1/file/upload', {
      method: 'POST',
      headers: {
        'x-api-key': pdfcoApiKey,
      },
      body: formData,
    });
    console.log('PDF.co upload request completed, status:', uploadResponse.status);
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.log('PDF.co upload error response:', errorText);
      throw new Error(`PDF.co upload failed with status ${uploadResponse.status}: ${errorText}`);
    }
    const uploadResult = await uploadResponse.json();
    const fileUrl = uploadResult.url;
    console.log('PDF.co uploaded file URL:', fileUrl);

    // Конвертація завантаженого файлу з детальним OCR
    const pdfcoResponse = await fetch('https://api.pdf.co/v1/pdf/convert/to/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': pdfcoApiKey,
      },
      body: JSON.stringify({
        url: fileUrl,
        pages: '0-', // Всі сторінки
        async: false,
        ocr: true, // Активувати OCR
        ocrLanguage: 'eng', // Мова OCR (наприклад, англійська)
        profiles: 'ocr-high', // Використання профілю для високої точності OCR
      }),
    });
    console.log('PDF.co analysis request completed, status:', pdfcoResponse.status);
    if (!pdfcoResponse.ok) {
      const errorText = await pdfcoResponse.text();
      console.log('PDF.co error response:', errorText);
      throw new Error(`PDF.co analysis failed with status ${pdfcoResponse.status}: ${errorText}`);
    }
    const result = await pdfcoResponse.json();
    const fullText = result.text || '';
    console.log('PDF text extracted, length:', fullText.length);

    if (!fullText) {
      throw new Error('No text extracted from PDF, possibly due to OCR failure or empty document');
    }

    const structure = {
      headers: fullText.match(/^#+ .*/gm) || [],
      paragraphs: fullText.split('\n\n').filter((p: string) => p.length > 50),
      tables: [],
    };
    console.log('Structure extracted:', structure);

    const summaryResponse = await fetch('https://api.x.ai/grok/summarize', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${grokApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fullText }),
    });
    console.log('Summary request completed, status:', summaryResponse.status);
    if (!summaryResponse.ok) {
      throw new Error(`Summary generation failed with status: ${summaryResponse.status}`);
    }
    const { summary } = await summaryResponse.json();
    console.log('Summary extracted, length:', summary.length);

    const fullAudio = await generateAudio(fullText);
    const fullAudioPath = await uploadAudio(fullAudio, filePath, 'full');
    const fullDuration = 180;

    const summaryAudio = await generateAudio(summary);
    const summaryAudioPath = await uploadAudio(summaryAudio, filePath, 'summary');
    const summaryDuration = 120;

    const { data: documentData, error: docError } = await supabase
      .from('documents')
      .insert({
        filename: filePath.split('/').pop(),
        data_size: buffer.byteLength,
      })
      .select('id')
      .single();
    console.log('Document insert attempt completed:', { docError });

    if (docError) {
      console.log('Document insert error:', docError.message);
      return new Response(JSON.stringify({ error: docError.message }), { status: 500, headers });
    }

    const { error: audioError } = await supabase.from('audio').insert([
      { document_id: documentData.id, duration_sec: fullDuration, create_date: new Date() },
      { document_id: documentData.id, duration_sec: summaryDuration, create_date: new Date() },
    ]);
    console.log('Audio insert attempt completed:', { audioError });

    if (audioError) {
      console.log('Audio insert error:', audioError.message);
      return new Response(JSON.stringify({ error: audioError.message }), { status: 500, headers });
    }

    console.log('Processing completed successfully');
    return new Response(
      JSON.stringify({
        structure,
        summary,
        fullAudioUrl: fullAudioPath,
        summaryAudioUrl: summaryAudioPath,
      }),
      { status: 200, headers }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Caught error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers });
  }
});

async function generateAudio(text: string): Promise<ArrayBuffer> {
  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/voice-id', {
    method: 'POST',
    headers: { 'xi-api-key': ttsApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`TTS API error: ${response.status}`);
  return await response.arrayBuffer();
}

async function uploadAudio(audio: ArrayBuffer, filePath: string, type: string): Promise<string> {
  const audioFileName = `${filePath.split('/').pop()}_${type}.mp3`;
  const { error } = await supabase.storage
    .from('audio-files')
    .upload(audioFileName, audio, { contentType: 'audio/mpeg' });
  if (error) throw error;

  const { data } = supabase.storage.from('audio-files').getPublicUrl(audioFileName);
  return data.publicUrl;
}