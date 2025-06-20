import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Play, Pause, Volume2, Download, FileText, Settings } from 'lucide-react';
import './pdfViewer.css';
import supabase from '../supabaseClient'; // Імпорт клієнта Supabase

const PdfViewer = ({ uploadedFile, onBack }) => {
  const [isPlayingFull, setIsPlayingFull] = useState(false); // Для повного аудіо
  const [isPlayingSummary, setIsPlayingSummary] = useState(false); // Для скороченого аудіо
  const [currentTimeFull, setCurrentTimeFull] = useState(0); // Час для повного аудіо
  const [currentTimeSummary, setCurrentTimeSummary] = useState(0); // Час для скороченого аудіо
  const [durationFull, setDurationFull] = useState(0); // Тривалість повного аудіо
  const [durationSummary, setDurationSummary] = useState(0); // Тривалість скороченого аудіо
  const [volume, setVolume] = useState(0.7);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages] = useState(5); // Приклад, можна оновити з реальних даних PDF
  const [analysisResult, setAnalysisResult] = useState(null); // Для зберігання результатів аналізу

  const audioRefFull = useRef(null); // Ref для повного аудіо
  const audioRefSummary = useRef(null); // Ref для скороченого аудіо
  const progressRefFull = useRef(null);
  const progressRefSummary = useRef(null);

  // Завантаження даних після монтування компонента
  useEffect(() => {
    const fetchAnalysis = async () => {
      if (uploadedFile) {
        const fileName = `${Date.now()}_${uploadedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('pdf-files')
          .upload(fileName, uploadedFile);

        if (uploadError) {
          console.error('Upload error:', uploadError.message);
          return;
        }

        const { data, error } = await supabase.functions.invoke('pdf-processor', {
          body: { filePath: fileName },
        });

        if (error) {
          console.error('Function error:', error.message);
          return;
        }

        setAnalysisResult(data);
        if (data.fullAudioUrl) {
          // Налаштування тривалості після завантаження аудіо
          const audio = new Audio(data.fullAudioUrl);
          audio.onloadedmetadata = () => setDurationFull(Math.floor(audio.duration));
        }
        if (data.summaryAudioUrl) {
          const audio = new Audio(data.summaryAudioUrl);
          audio.onloadedmetadata = () => setDurationSummary(Math.floor(audio.duration));
        }
      }
    };

    fetchAnalysis();
  }, [uploadedFile]);

  // Симуляція прогресу аудіо
  useEffect(() => {
    let intervalFull, intervalSummary;
    if (isPlayingFull) {
      intervalFull = setInterval(() => {
        setCurrentTimeFull(prev => {
          if (prev >= durationFull) {
            setIsPlayingFull(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    if (isPlayingSummary) {
      intervalSummary = setInterval(() => {
        setCurrentTimeSummary(prev => {
          if (prev >= durationSummary) {
            setIsPlayingSummary(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      clearInterval(intervalFull);
      clearInterval(intervalSummary);
    };
  }, [isPlayingFull, durationFull, isPlayingSummary, durationSummary]);

  const togglePlayPauseFull = () => {
    setIsPlayingFull(!isPlayingFull);
  };

  const togglePlayPauseSummary = () => {
    setIsPlayingSummary(!isPlayingSummary);
  };

  const handleProgressClickFull = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * durationFull;
    setCurrentTimeFull(newTime);
  };

  const handleProgressClickSummary = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * durationSummary;
    setCurrentTimeSummary(newTime);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const generateWaveformBars = (count = 50, currentTime, duration) => {
    return Array.from({ length: count }, (_, i) => {
      const height = Math.random() * 40 + 10;
      const isActive = (i / count) <= (currentTime / duration);
      return (
        <div
          key={i}
          className={`waveform-bar ${isActive ? 'active' : ''}`}
          style={{ height: `${height}px` }}
        />
      );
    });
  };

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-viewer-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft className="back-icon" />
        </button>
        <div className="file-info">
          <FileText className="file-icon" />
          <span className="file-name">{uploadedFile?.name || 'Document.pdf'}</span>
        </div>
        <div className="header-actions"></div>
      </div>

      <div className="pdf-viewer-content">
        {/* PDF Display Area */}
        <div className="pdf-display-section">
          <div className="pdf-preview">
            <div className="pdf-page">
              <div className="pdf-content">
                <div className="pdf-placeholder">
                  <FileText size={48} />
                  <p>PDF Content Preview</p>
                  <p className="page-info">Page {currentPage} of {totalPages}</p>
                </div>
              </div>
            </div>
            <div className="page-navigation">
              <button
                className="nav-button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <span className="page-counter">{currentPage} / {totalPages}</span>
              <button
                className="nav-button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Audio Player Section */}
        <div className="audio-player-section">
          <div className="audio-player">
            <div className="player-header">
              <h3 className="player-title">Full PDF Audio</h3>
              <div className="player-actions">
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="speed-select"
                >
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
                <a href={analysisResult?.fullAudioUrl} download>
                  <button className="action-button download-btn">
                    <Download className="action-icon" />
                  </button>
                </a>
              </div>
            </div>
            <div className="waveform-container">
              <div className="waveform" onClick={handleProgressClickFull} ref={progressRefFull}>
                {generateWaveformBars(50, currentTimeFull, durationFull)}
              </div>
              <div
                className="progress-line"
                style={{ width: `${(currentTimeFull / durationFull) * 100 || 0}%` }}
              />
            </div>
            <div className="player-controls">
              <div className="control-group">
                <button className="control-button play-button" onClick={togglePlayPauseFull}>
                  {isPlayingFull ? <Pause size={24} /> : <Play size={24} />}
                </button>
                <div className="time-display">
                  <span className="current-time">{formatTime(currentTimeFull)}</span>
                  <span className="separator">/</span>
                  <span className="total-time">{formatTime(durationFull)}</span>
                </div>
              </div>
              <div className="volume-control">
                <Volume2 size={20} />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="volume-slider"
                />
              </div>
            </div>
            <audio ref={audioRefFull} src={analysisResult?.fullAudioUrl} />
          </div>

          <div className="audio-player secondary">
            <div className="player-header">
              <h3 className="player-title">Gist PDF Audio</h3>
              <div className="player-actions">
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="speed-select"
                >
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
                <a href={analysisResult?.summaryAudioUrl} download>
                  <button className="action-button download-btn">
                    <Download className="action-icon" />
                  </button>
                </a>
              </div>
            </div>
            <div className="waveform-container">
              <div className="waveform" onClick={handleProgressClickSummary} ref={progressRefSummary}>
                {generateWaveformBars(45, currentTimeSummary, durationSummary)}
              </div>
              <div
                className="progress-line"
                style={{ width: `${(currentTimeSummary / durationSummary) * 100 || 0}%` }}
              />
            </div>
            <div className="player-controls">
              <div className="control-group">
                <button className="control-button play-button" onClick={togglePlayPauseSummary}>
                  {isPlayingSummary ? <Pause size={24} /> : <Play size={24} />}
                </button>
                <div className="time-display">
                  <span className="current-time">{formatTime(currentTimeSummary)}</span>
                  <span className="separator">/</span>
                  <span className="total-time">{formatTime(durationSummary)}</span>
                </div>
              </div>
              <div className="volume-control">
                <Volume2 size={20} />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="volume-slider"
                />
              </div>
            </div>
            <audio ref={audioRefSummary} src={analysisResult?.summaryAudioUrl} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfViewer;