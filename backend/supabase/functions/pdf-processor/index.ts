import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// API Configuration
const grokApiKey = Deno.env.get('GROK_API_KEY')!;
const ttsApiKey = Deno.env.get('ELEVENLABS_API_KEY')!; // ElevenLabs API key
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

    // Download file from Supabase Storage
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

    if (buffer.byteLength > 10 * 1024 * 1024) { // 10 MB limit check
      throw new Error('File size exceeds 10 MB limit for PDF.co');
    }

    // === PDF.CO INTEGRATION ===
    
    // 1. Get presigned URL for upload
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

    // 2. Upload file to PDF.co
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    });
    
    console.log('PDF.co upload request completed, status:', uploadResponse.status);
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.log('PDF.co upload error response:', errorText);
      throw new Error(`PDF.co upload failed with status ${uploadResponse.status}: ${errorText}`);
    }

    // 3. Convert PDF to text
    const convertPayload = {
      name: fileName,
      password: '',
      pages: '',
      url: uploadedFileUrl,
      inline: true,
      async: false,
      ocr: true,
      ocrLanguage: 'eng',
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

    // Extract text
    let fullText = '';
    
    if (convertResult.body) {
      fullText = convertResult.body;
    } else if (convertResult.text) {
      fullText = convertResult.text;
    } else if (convertResult.url) {
      const textResponse = await fetch(convertResult.url);
      if (!textResponse.ok) {
        throw new Error(`Failed to download converted text: ${textResponse.status}`);
      }
      fullText = await textResponse.text();
    } else {
      throw new Error('No text content received from PDF.co');
    }

    // Clean up text
    fullText = fullText
      .replace(/\\r\\n/g, '\n')
      .replace(/\\f/g, '')
      .replace(/\[Link\]/g, '')
      .trim();

    console.log('PDF text extracted, length:', fullText.length);
    console.log('PDF text preview:', fullText.substring(0, 500));

    // Validate extracted text
    if (!fullText || fullText.trim().length === 0) {
      throw new Error('No text extracted from PDF, possibly due to OCR failure or empty document');
    }

    const meaningfulTextLength = fullText.replace(/[^a-zA-Zа-яА-Я0-9]/g, '').length;
    if (meaningfulTextLength < 50) {
      console.log('Warning: Very little meaningful text extracted');
    }

    // === TEXT PROCESSING ===
    
    // Create document structure
    const structure = {
      headers: fullText.match(/^#+ .*/gm) || [],
      paragraphs: fullText.split('\n\n').filter((p: string) => p.trim().length > 50),
      tables: [],
    };
    console.log('Structure extracted:', {
      headersCount: structure.headers.length,
      paragraphsCount: structure.paragraphs.length,
    });

    // Generate summary
    const summary = generateSummary(fullText);
    console.log('Summary created, length:', summary.length);

    // Generate audio with error handling
    let fullAudioPath = '';
    let summaryAudioPath = '';
    let fullDuration = 0;
    let summaryDuration = 0;

    try {
      // Validate TTS API key before making requests
      if (!ttsApiKey || ttsApiKey.trim() === '') {
        throw new Error('TTS_API_KEY environment variable is not set');
      }

      console.log('Generating full audio...');
      const fullAudio = await generateAudio(fullText.substring(0, 5000));
      fullAudioPath = await uploadAudio(fullAudio, filePath, 'full');
      fullDuration = estimateAudioDuration(fullText.substring(0, 5000));

      console.log('Generating summary audio...');
      const summaryAudio = await generateAudio(summary);
      summaryAudioPath = await uploadAudio(summaryAudio, filePath, 'summary');
      summaryDuration = estimateAudioDuration(summary);

    } catch (audioError) {
      console.error('Audio generation failed:', audioError);
      // Continue without audio - don't fail the entire process
      fullAudioPath = '';
      summaryAudioPath = '';
      fullDuration = 0;
      summaryDuration = 0;
    }

    // Save to database
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

    // Only insert audio records if audio was generated successfully
    if (fullAudioPath || summaryAudioPath) {
      const audioRecords = [];
      if (fullAudioPath) {
        audioRecords.push({
          document_id: documentData.id,
          duration_sec: fullDuration,
          create_date: new Date().toISOString(),
          audio_type: 'full'
        });
      }
      if (summaryAudioPath) {
        audioRecords.push({
          document_id: documentData.id,
          duration_sec: summaryDuration,
          create_date: new Date().toISOString(),
          audio_type: 'summary'
        });
      }

      if (audioRecords.length > 0) {
        const { error: audioError } = await supabase.from('audio').insert(audioRecords);
        console.log('Audio insert attempt completed:', { audioError });

        if (audioError) {
          console.log('Audio insert error:', audioError.message);
          // Don't fail the entire process for audio insert errors
        }
      }
    }

    console.log('Processing completed successfully');
    return new Response(
      JSON.stringify({
        structure,
        summary,
        fullAudioUrl: fullAudioPath,
        summaryAudioUrl: summaryAudioPath,
        textLength: fullText.length,
        audioGenerated: !!(fullAudioPath || summaryAudioPath),
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

function generateSummary(text: string): string {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  if (sentences.length <= 3) {
    return text;
  }

  const summary = [
    sentences[0],
    sentences[Math.floor(sentences.length / 2)],
    sentences[sentences.length - 1]
  ].join('. ') + '.';

  return summary.length > 1000 ? summary.substring(0, 1000) + '...' : summary;
}

function estimateAudioDuration(text: string): number {
  // Rough estimate: ~150 words per minute, ~5 characters per word
  const wordCount = text.length / 5;
  const minutes = wordCount / 150;
  return Math.ceil(minutes * 60); // Return seconds
}

async function generateAudio(text: string): Promise<ArrayBuffer> {
  // Limit text length for TTS
  const maxLength = 5000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  
  console.log('Generating audio for text length:', truncatedText.length);

  // Validate API key
  if (!ttsApiKey || ttsApiKey.trim() === '') {
    throw new Error('TTS API key is not configured');
  }
  
  // Use a default voice ID - you should replace this with a valid one from your ElevenLabs account
  const voiceId = 'pNInz6obpgDQGcFmaJgB';
  
  console.log('Making TTS API request...');
  
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 
      'xi-api-key': ttsApiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({ 
      text: truncatedText,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
        style: 0.0,
        use_speaker_boost: true
      }
    }),
  });
  
  console.log('TTS API response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log('TTS API error response:', errorText);
    
    // Parse error details if available
    let errorDetails = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorDetails = errorJson.detail?.message || errorJson.message || errorText;
    } catch {
      // Keep original error text if not JSON
    }
    
    throw new Error(`TTS API error (${response.status}): ${errorDetails}`);
  }
  
  const audioBuffer = await response.arrayBuffer();
  console.log('Audio generated successfully, size:', audioBuffer.byteLength);
  
  return audioBuffer;
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