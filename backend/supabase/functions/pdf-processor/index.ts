import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// API Configuration
const grokApiKey = Deno.env.get('GROK_API_KEY')!;
const ttsApiKey = Deno.env.get('TTS_API_KEY')!;
const googleApiKey = Deno.env.get('GOOGLE_API_KEY')!;
if (!googleApiKey) {
  throw new Error('GOOGLE_API_KEY is not set in environment variables');
}

console.log('Google API Key length:', googleApiKey.length);
if (!googleApiKey || googleApiKey.length < 20) {
  console.error('Google API Key is invalid or too short!');
}

serve(async (req: Request) => {
  const headers = new Headers();
  headers.append('Access-Control-Allow-Origin', 'http://localhost:5173');
  headers.append('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.append('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info, apikey');
  headers.append('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  console.log('Received request:', req.method, req.url);

  try {
    if (req.method !== 'POST') {
      console.log('Method not allowed:', req.method);
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
    }

    const { filePath } = await req.json();
    console.log('Processing file:', filePath);

    // Download file from Supabase storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('pdf-files')
      .download(filePath);

    if (fileError) {
      console.error('Storage download error:', fileError);
      return new Response(JSON.stringify({ error: `Storage error: ${fileError.message}` }), { status: 400, headers });
    }

    const buffer = await fileData.arrayBuffer();
    console.log('File downloaded, size:', buffer.byteLength, 'bytes');

    // Extract text using Google Vision API
    let extractedText = '';
    let extractionMethod = '';
    try {
      const visionResult = await extractTextWithGoogleVision(buffer, googleApiKey);
      if (visionResult.text && visionResult.text.trim().length > 0) {
        extractedText = visionResult.text;
        extractionMethod = 'Google Vision OCR';
      }
    } catch (error) {
      console.warn('Google Vision extraction failed:', String(error));
      return new Response(JSON.stringify({ 
        error: 'Google Vision OCR failed', 
        details: String(error) 
      }), { status: 400, headers });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      console.error('No text could be extracted from the PDF');
      return new Response(JSON.stringify({ 
        error: 'No text could be extracted from this PDF. This could be due to: 1) The PDF contains only images without text, 2) The PDF is password protected, 3) The PDF format is not supported, or 4) OCR processing failed.',
        details: 'Text extraction failed with Google Vision'
      }), { status: 400, headers });
    }

    console.log(`Text extracted using ${extractionMethod}, length:`, extractedText.length);

    // Create document structure
    const structure = analyzeDocumentStructure(extractedText);
    console.log('Document structure analyzed:', Object.keys(structure));

    // Generate summary
    let summary = '';
    try {
      summary = await generateSummary(extractedText, grokApiKey);
      console.log('Summary generated, length:', summary.length);
    } catch (error) {
      console.warn('Summary generation failed:', String(error));
      summary = extractedText.substring(0, 500) + '...';
    }

    // Generate audio files
    let fullAudioPath = '';
    let summaryAudioPath = '';
    let fullDuration = 0;
    let summaryDuration = 0;

    try {
      const fullAudio = await generateAudio(extractedText, ttsApiKey);
      fullAudioPath = await uploadAudio(fullAudio, filePath, 'full');
      fullDuration = estimateAudioDuration(extractedText);
      console.log('Full audio generated and uploaded');
    } catch (error) {
      console.warn('Full audio generation failed:', String(error));
    }

    try {
      const summaryAudio = await generateAudio(summary, ttsApiKey);
      summaryAudioPath = await uploadAudio(summaryAudio, filePath, 'summary');
      summaryDuration = estimateAudioDuration(summary);
      console.log('Summary audio generated and uploaded');
    } catch (error) {
      console.warn('Summary audio generation failed:', String(error));
    }

    // Store in database
    const { data: documentData, error: docError } = await supabase
      .from('documents')
      .insert({
        filename: filePath.split('/').pop(),
        data_size: buffer.byteLength,
        extraction_method: extractionMethod,
        text_length: extractedText.length
      })
      .select('id')
      .single();

    if (docError) {
      console.error('Document insert error:', docError);
      return new Response(JSON.stringify({ error: `Database error: ${docError.message}` }), { status: 500, headers });
    }

    // Store audio records
    if (fullAudioPath || summaryAudioPath) {
      const audioRecords = [];
      if (fullAudioPath) {
        audioRecords.push({ 
          document_id: documentData.id, 
          duration_sec: fullDuration, 
          audio_type: 'full',
          audio_url: fullAudioPath,
          create_date: new Date() 
        });
      }
      if (summaryAudioPath) {
        audioRecords.push({ 
          document_id: documentData.id, 
          duration_sec: summaryDuration, 
          audio_type: 'summary',
          audio_url: summaryAudioPath,
          create_date: new Date() 
        });
      }

      if (audioRecords.length > 0) {
        const { error: audioError } = await supabase.from('audio').insert(audioRecords);
        if (audioError) {
          console.warn('Audio insert error:', audioError);
        }
      }
    }

    console.log('Processing completed successfully');
    return new Response(
      JSON.stringify({
        success: true,
        structure,
        summary,
        fullAudioUrl: fullAudioPath,
        summaryAudioUrl: summaryAudioPath,
        extractionMethod,
        textLength: extractedText.length,
        documentId: documentData.id
      }),
      { status: 200, headers }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Unexpected error:', errorMessage);
    return new Response(JSON.stringify({ 
      error: 'An unexpected error occurred during processing', 
      details: errorMessage 
    }), { status: 500, headers });
  }
});

async function extractTextWithGoogleVision(buffer: ArrayBuffer, apiKey: string): Promise<{ text: string }> {
  const base64Image = btoa(String.fromCharCode(...new Uint8Array(buffer)));

  const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'TEXT_DETECTION', maxResults: 10 }],
        imageContext: { languageHints: ['uk', 'en'] },
      }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Vision API failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const text = result.responses[0]?.fullTextAnnotation?.text || '';
  console.log('Google Vision response:', { textLength: text.length, hasText: !!text });
  return { text };
}

function analyzeDocumentStructure(text: string): any {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  return {
    headers: lines.filter(line => 
      line.match(/^[A-Z\s]+$/) || 
      line.match(/^\d+\./) || 
      line.match(/^[A-Z][a-z\s]*:/)
    ).slice(0, 10),
    paragraphs: text.split('\n\n')
      .filter(p => p.trim().length > 50)
      .slice(0, 20),
    tables: extractTables(text), // Додано витягнення таблиць
    wordCount: text.split(/\s+/).length,
    characterCount: text.length,
    lineCount: lines.length
  };
}

function extractTables(text: string): string[][] {
  const tableSections = text.split('\n').reduce((acc: string[][], line: string, index: number, lines: string[]) => {
    if (line.trim().startsWith('|') && lines[index - 1]?.trim().startsWith('|')) {
      acc[acc.length - 1].push(line.trim());
    } else if (line.trim().startsWith('|')) {
      acc.push([line.trim()]);
    }
    return acc;
  }, []);
  return tableSections.map(section => section.map(row => row.split('|').map(cell => cell.trim()).filter(cell => cell)));
}

async function generateSummary(text: string, apiKey: string): Promise<string> {
  const maxLength = 10000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'grok-beta',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates concise summaries of documents. Provide a clear, informative summary that captures the main points.'
        },
        {
          role: 'user',
          content: `Please provide a concise summary of the following document:\n\n${truncatedText}`
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`Grok API error: ${response.status}`);
  }

  const result = await response.json();
  return result.choices[0]?.message?.content || 'Summary generation failed';
}

async function generateAudio(text: string, apiKey: string): Promise<ArrayBuffer> {
  const maxLength = 5000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: truncatedText,
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.5, similarity_boost: 0.5 }
    })
  });

  if (!response.ok) {
    throw new Error(`TTS API error: ${response.status}`);
  }

  return await response.arrayBuffer();
}

async function uploadAudio(audio: ArrayBuffer, filePath: string, type: string): Promise<string> {
  const audioFileName = `${filePath.split('/').pop()?.replace('.pdf', '')}_${type}_${Date.now()}.mp3`;
  
  const { error } = await supabase.storage
    .from('audio-files')
    .upload(audioFileName, audio, { 
      contentType: 'audio/mpeg',
      cacheControl: '3600'
    });

  if (error) {
    throw new Error(`Audio upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from('audio-files').getPublicUrl(audioFileName);
  return data.publicUrl;
}

function estimateAudioDuration(text: string): number {
  const wordCount = text.split(/\s+/).length;
  return Math.ceil(wordCount / 2.5); // ~150 words per minute
}