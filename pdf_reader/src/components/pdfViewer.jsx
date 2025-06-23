import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Play, Pause, Volume2, Download, FileText, Settings } from 'lucide-react';
import './pdfViewer.css';

const PdfViewer = ({ uploadedFile, onBack, analysisResult }) => {
  const [isPlayingFull, setIsPlayingFull] = useState(false);
  const [isPlayingSummary, setIsPlayingSummary] = useState(false);
  const [currentTimeFull, setCurrentTimeFull] = useState(0);
  const [currentTimeSummary, setCurrentTimeSummary] = useState(0);
  const [durationFull, setDurationFull] = useState(0);
  const [durationSummary, setDurationSummary] = useState(0);
  const [volumeFull, setVolumeFull] = useState(0.7);
  const [volumeSummary, setVolumeSummary] = useState(0.7);
  const [playbackSpeedFull, setPlaybackSpeedFull] = useState(1);
  const [playbackSpeedSummary, setPlaybackSpeedSummary] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFullText, setShowFullText] = useState(false);

  const audioRefFull = useRef(null);
  const audioRefSummary = useRef(null);

  // Обчислюємо загальну кількість сторінок на основі тексту
  const totalPages = analysisResult?.structure?.paragraphs ? 
    Math.ceil(analysisResult.structure.paragraphs.length / 3) : 1;

  // Отримуємо текст для поточної сторінки
  const getCurrentPageText = () => {
    if (!analysisResult?.structure?.paragraphs) return '';
    const paragraphsPerPage = 3;
    const startIndex = (currentPage - 1) * paragraphsPerPage;
    const endIndex = startIndex + paragraphsPerPage;
    const pageParagraphs = analysisResult.structure.paragraphs.slice(startIndex, endIndex);
    return pageParagraphs.join('\n\n');
  };

  // Ініціалізація аудіо елементів для повного тексту
  useEffect(() => {
    if (analysisResult?.fullAudioUrl && audioRefFull.current) {
      const audio = audioRefFull.current;
      audio.src = analysisResult.fullAudioUrl;
      audio.volume = volumeFull;
      audio.playbackRate = playbackSpeedFull;
      
      const handleLoadedMetadata = () => {
        setDurationFull(Math.floor(audio.duration));
      };
      
      const handleTimeUpdate = () => {
        setCurrentTimeFull(Math.floor(audio.currentTime));
      };

      const handleEnded = () => {
        setIsPlayingFull(false);
        setCurrentTimeFull(0);
      };

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
      };
    }
  }, [analysisResult?.fullAudioUrl]);

  // Ініціалізація аудіо елементів для короткого змісту
  useEffect(() => {
    if (analysisResult?.summaryAudioUrl && audioRefSummary.current) {
      const audio = audioRefSummary.current;
      audio.src = analysisResult.summaryAudioUrl;
      audio.volume = volumeSummary;
      audio.playbackRate = playbackSpeedSummary;
      
      const handleLoadedMetadata = () => {
        setDurationSummary(Math.floor(audio.duration));
      };
      
      const handleTimeUpdate = () => {
        setCurrentTimeSummary(Math.floor(audio.currentTime));
      };

      const handleEnded = () => {
        setIsPlayingSummary(false);
        setCurrentTimeSummary(0);
      };

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('ended', handleEnded);

      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('ended', handleEnded);
      };
    }
  }, [analysisResult?.summaryAudioUrl]);

  // Оновлення налаштувань аудіо для повного тексту
  useEffect(() => {
    if (audioRefFull.current) {
      audioRefFull.current.volume = volumeFull;
    }
  }, [volumeFull]);

  useEffect(() => {
    if (audioRefFull.current) {
      audioRefFull.current.playbackRate = playbackSpeedFull;
    }
  }, [playbackSpeedFull]);

  // Оновлення налаштувань аудіо для короткого змісту
  useEffect(() => {
    if (audioRefSummary.current) {
      audioRefSummary.current.volume = volumeSummary;
    }
  }, [volumeSummary]);

  useEffect(() => {
    if (audioRefSummary.current) {
      audioRefSummary.current.playbackRate = playbackSpeedSummary;
    }
  }, [playbackSpeedSummary]);

  const togglePlayPauseFull = () => {
    if (audioRefFull.current) {
      if (isPlayingFull) {
        audioRefFull.current.pause();
      } else {
        audioRefFull.current.play();
      }
      setIsPlayingFull(!isPlayingFull);
    }
  };

  const togglePlayPauseSummary = () => {
    if (audioRefSummary.current) {
      if (isPlayingSummary) {
        audioRefSummary.current.pause();
      } else {
        audioRefSummary.current.play();
      }
      setIsPlayingSummary(!isPlayingSummary);
    }
  };

  const handleProgressClickFull = (e) => {
    if (audioRefFull.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const newTime = (clickX / rect.width) * durationFull;
      audioRefFull.current.currentTime = newTime;
      setCurrentTimeFull(newTime);
    }
  };

  const handleProgressClickSummary = (e) => {
    if (audioRefSummary.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const newTime = (clickX / rect.width) * durationSummary;
      audioRefSummary.current.currentTime = newTime;
      setCurrentTimeSummary(newTime);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const generateWaveformBars = (count = 50, currentTime, duration) => {
    return Array.from({ length: count }, (_, i) => {
      const height = Math.random() * 40 + 10;
      const isActive = (i / count) <= (currentTime / duration) && duration > 0;
      return (
        <div
          key={i}
          className={`waveform-bar ${isActive ? 'active' : ''}`}
          style={{ height: `${height}px` }}
        />
      );
    });
  };

  if (!analysisResult) {
    return (
      <div className="pdf-viewer-container loading">
        <div className="loading-content">
          <FileText size={48} />
          <p>Завантаження та аналіз PDF...</p>
        </div>
      </div>
    );
  }

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
        <div className="header-actions">
          <button 
            className="action-button"
            onClick={() => setShowFullText(!showFullText)}
          >
            {showFullText ? 'Показати сторінки' : 'Показати весь текст'}
          </button>
        </div>
      </div>

      <div className="pdf-viewer-content">
        {/* PDF Display Area */}
        <div className="pdf-display-section">
          <div className="pdf-preview">
            <div className="pdf-page">
              <div className="pdf-content">
                {showFullText ? (
                  <div className="full-text-content">
                    <h3>Full document text</h3>
                    <div className="text-content">
                      {analysisResult.structure?.paragraphs?.map((paragraph, index) => (
                        <p key={index} className="text-paragraph">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="page-content">
                    <div className="page-text">
                      {getCurrentPageText().split('\n\n').map((paragraph, index) => (
                        <p key={index} className="text-paragraph">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {!showFullText && (
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
            )}
          </div>

          {/* Summary Section */}
          {analysisResult.summary && (
            <div className="summary-section">
              <h3>Короткий зміст</h3>
              <div className="summary-content">
                <p>{analysisResult.summary}</p>
              </div>
            </div>
          )}
        </div>

        {/* Audio Player Section */}
        <div className="audio-player-section">
          {/* Full Audio Player */}
          {analysisResult.fullAudioUrl && (
            <div className="audio-player">
              <div className="player-header">
                <h3 className="player-title">Full version (audio)</h3>
                <div className="player-actions">
                  <select
                    value={playbackSpeedFull}
                    onChange={(e) => setPlaybackSpeedFull(parseFloat(e.target.value))}
                    className="speed-select"
                  >
                    <option value="0.5">0.5x</option>
                    <option value="0.75">0.75x</option>
                    <option value="1">1x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2x</option>
                  </select>
                  <a href={analysisResult.fullAudioUrl} download>
                    <button className="action-button download-btn">
                      <Download className="action-icon" />
                    </button>
                  </a>
                </div>
              </div>
              <div className="waveform-container">
                <div className="waveform" onClick={handleProgressClickFull}>
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
                    value={volumeFull}
                    onChange={(e) => setVolumeFull(parseFloat(e.target.value))}
                    className="volume-slider"
                  />
                </div>
              </div>
              <audio ref={audioRefFull} />
            </div>
          )}

          {/* Summary Audio Player */}
          {analysisResult.summaryAudioUrl && (
            <div className="audio-player secondary">
              <div className="player-header">
                <h3 className="player-title">Summary (audio)</h3>
                <div className="player-actions">
                  <select
                    value={playbackSpeedSummary}
                    onChange={(e) => setPlaybackSpeedSummary(parseFloat(e.target.value))}
                    className="speed-select"
                  >
                    <option value="0.5">0.5x</option>
                    <option value="0.75">0.75x</option>
                    <option value="1">1x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2x</option>
                  </select>
                  <a href={analysisResult.summaryAudioUrl} download>
                    <button className="action-button download-btn">
                      <Download className="action-icon" />
                    </button>
                  </a>
                </div>
              </div>
              <div className="waveform-container">
                <div className="waveform" onClick={handleProgressClickSummary}>
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
                    value={volumeSummary}
                    onChange={(e) => setVolumeSummary(parseFloat(e.target.value))}
                    className="volume-slider"
                  />
                </div>
              </div>
              <audio ref={audioRefSummary} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PdfViewer;