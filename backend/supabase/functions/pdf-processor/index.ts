import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Налаштування API
const grokApiKey = Deno.env.get('GROK_API_KEY')!;
const ttsApiKey = Deno.env.get('TTS_API_KEY')!; // Наприклад, ElevenLabs
const pdfcoApiKey = Deno.env.get('PDF_API_KEY')!;
console.log('PDF.co API Key configured');

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

    // Завантажуємо файл з Supabase Storage
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

    // === PDF.CO INTEGRATION ===
    
    // 1. Отримуємо presigned URL для завантаження
    const fileName = filePath.split('/').pop() || 'uploaded.pdf';
    const presignedResponse = await fetch(`https://api.pdf.co/v1/file/upload/get-presigned-url?contenttype=application/octet-stream&name=${encodeURIComponent(fileName)}`, {
      method: 'GET',
      headers: { 'x-api-key': pdfcoApiKey },
    });
    
    if (!presignedResponse.ok) {
      throw new Error(`Failed to get presigned URL: ${presignedResponse.status}`);
    }
    
    const presignedData = await presignedResponse.json();
    console.log('Presigned response:', presignedData);
    
    if (presignedData.error) {
      throw new Error(`getPresignedUrl(): ${presignedData.message}`);
    }
    
    const uploadUrl = presignedData.presignedUrl;
    const uploadedFileUrl = presignedData.url;
    console.log('Presigned URL received:', uploadedFileUrl);

    // 2. Завантажуємо файл до PDF.co (використовуємо PUT з raw binary data)
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: buffer, // Передаємо raw ArrayBuffer
    });
    
    console.log('PDF.co upload request completed, status:', uploadResponse.status);
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.log('PDF.co upload error response:', errorText);
      throw new Error(`PDF.co upload failed with status ${uploadResponse.status}: ${errorText}`);
    }

    // 3. Конвертуємо PDF в текст
    const convertPayload = {
      name: fileName,
      password: '', // Порожній пароль для незахищених документів
      pages: '', // Порожня строка означає всі сторінки
      url: uploadedFileUrl,
      inline: true, // Отримати результат в JSON відповіді
      async: false, // Синхронна обробка
      ocr: true, // Активувати OCR для сканованих документів
      ocrLanguage: 'eng', // Мова OCR
    };

    console.log('Converting PDF to text with payload:', convertPayload);

    const convertResponse = await fetch('https://api.pdf.co/v1/pdf/convert/to/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': pdfcoApiKey,
      },
      body: JSON.stringify(convertPayload),
    });

    console.log('PDF.co convert request completed, status:', convertResponse.status);
    
    if (!convertResponse.ok) {
      const errorText = await convertResponse.text();
      console.log('PDF.co convert error response:', errorText);
      throw new Error(`PDF.co conversion failed with status ${convertResponse.status}: ${errorText}`);
    }

    const convertResult = await convertResponse.json();
    console.log('Convert result:', convertResult);

    if (convertResult.error) {
      throw new Error(`PDF.co conversion error: ${convertResult.message}`);
    }

    // Отримуємо текст
    let fullText = '';
    
    if (convertResult.inline && convertResult.text) {
      // Якщо inline=true, текст повертається прямо в відповіді
      fullText = convertResult.text;
    } else if (convertResult.url) {
      // Якщо inline=false, треба завантажити текстовий файл
      const textResponse = await fetch(convertResult.url);
      if (!textResponse.ok) {
        throw new Error(`Failed to download converted text: ${textResponse.status}`);
      }
      fullText = await textResponse.text();
    } else {
      throw new Error('No text content received from PDF.co');
    }

    console.log('PDF text extracted, length:', fullText.length);

    if (!fullText || fullText.trim().length === 0) {
      throw new Error('No text extracted from PDF, possibly due to OCR failure or empty document');
    }

    // === ОБРОБКА ТЕКСТУ ===
    
    // Створюємо структуру документа
    const structure = {
      headers: fullText.match(/^#+ .*/gm) || [],
      paragraphs: fullText.split('\n\n').filter((p: string) => p.trim().length > 50),
      tables: [], // Можна додати логіку для виявлення таблиць
    };
    console.log('Structure extracted:', {
      headersCount: structure.headers.length,
      paragraphsCount: structure.paragraphs.length,
    });

    // Генеруємо резюме (замініть на реальний API)
    const summary = fullText.length > 1000 
      ? fullText.substring(0, 1000) + '...' 
      : fullText;
    console.log('Summary created, length:', summary.length);

    // Генеруємо аудіо
    const fullAudio = await generateAudio(fullText.substring(0, 5000)); // Обмежуємо для демо
    const fullAudioPath = await uploadAudio(fullAudio, filePath, 'full');
    const fullDuration = 180;

    const summaryAudio = await generateAudio(summary);
    const summaryAudioPath = await uploadAudio(summaryAudio, filePath, 'summary');
    const summaryDuration = 120;

    // Зберігаємо в базу даних
    const { data: documentData, error: docError } = await supabase
      .from('documents')
      .insert({
        filename: fileName,
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
      { document_id: documentData.id, duration_sec: fullDuration, create_date: new Date().toISOString() },
      { document_id: documentData.id, duration_sec: summaryDuration, create_date: new Date().toISOString() },
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
        textLength: fullText.length,
      }),
      { 
        status: 200, 
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        }
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Caught error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { 
        status: 500, 
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        }
      }
    );
  }
});

async function generateAudio(text: string): Promise<ArrayBuffer> {
  // Обмежуємо довжину тексту для TTS
  const maxLength = 5000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  
  console.log('Generating audio for text length:', truncatedText.length);
  
  // Замініть на правильний voice ID з ElevenLabs
  const voiceId = 'pNInz6obpgDQGcFmaJgB'; // Приклад voice ID
  
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 
      'xi-api-key': ttsApiKey, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ 
      text: truncatedText,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5
      }
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log('TTS API error:', errorText);
    throw new Error(`TTS API error: ${response.status} - ${errorText}`);
  }
  
  return await response.arrayBuffer();
}

async function uploadAudio(audio: ArrayBuffer, filePath: string, type: string): Promise<string> {
  const audioFileName = `${filePath.split('/').pop()?.replace('.pdf', '')}_${type}_${Date.now()}.mp3`;
  
  console.log('Uploading audio file:', audioFileName);
  
  const { error } = await supabase.storage
    .from('audio-files')
    .upload(audioFileName, audio, { 
      contentType: 'audio/mpeg',
      upsert: true 
    });
    
  if (error) {
    console.log('Audio upload error:', error.message);
    throw error;
  }

  const { data } = supabase.storage.from('audio-files').getPublicUrl(audioFileName);
  console.log('Audio uploaded successfully:', data.publicUrl);
  
  return data.publicUrl;
}