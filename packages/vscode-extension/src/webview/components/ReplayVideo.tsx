import React, { useEffect, useRef, useState } from "react";
import "./ReplayVideo.css";
import Button from "./shared/Button";
import ReplayOverlay from "./ReplayOverlay";

type ReplayVideoProps = {
  src: string;
  onClose: () => void;
};

function rewindVideo(video: HTMLVideoElement, readyCallback: () => void) {
  const rewindTimeSec = 1.6;

  const v0 = 0.1;
  const vFinal = 2 / rewindTimeSec - v0;
  const acc = (vFinal - v0) / rewindTimeSec;

  const videoDuration = video.duration;
  video.currentTime = videoDuration;

  let startTimeMs: number | null = null;
  function frame(timestampMs: number) {
    if (!startTimeMs) {
      startTimeMs = timestampMs;
    }
    const elapsedSec = Math.min((timestampMs - startTimeMs) / 1000, rewindTimeSec);

    // progress = v0 * t + 0.5 * a * t^2
    const progress = v0 * elapsedSec + 0.5 * acc * elapsedSec * elapsedSec;
    // console.log("EEE", elapsedSec, progress);

    if (elapsedSec < rewindTimeSec) {
      video.currentTime = Math.max(0, videoDuration * (1 - progress));
      requestAnimationFrame(frame);
    } else {
      video.currentTime = 0;
      readyCallback();
    }
  }
  requestAnimationFrame(frame);
}

function VHSRewind() {
  return (
    <div className="phone-screen">
      <div className="vhs-lines"></div>
      <div className="crt-lines"></div>
      <div className="vhs-bg">
        <div className="vhs-text">
          <div className="vhs-noise" />
          {"\u25C0\u25C0"}
          <br /> REWIND
        </div>
      </div>
    </div>
  );
}
interface SeekbarProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}

function isVideoPlaying(videoElement: HTMLVideoElement) {
  return !videoElement.paused && !videoElement.ended && videoElement.readyState > 2;
}

function Seekbar({ videoRef }: SeekbarProps) {
  const [progress, setProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const seekbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateProgress = () => {
      const progress = (video.currentTime / video.duration) * 100;
      setProgress(progress);
    };

    video.addEventListener("timeupdate", updateProgress);
    return () => video.removeEventListener("timeupdate", updateProgress);
  }, [videoRef]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const seekbar = seekbarRef.current;
    if (!seekbar) return;

    const rect = seekbar.getBoundingClientRect();
    const seekPosition = (e.clientX - rect.left) / rect.width;
    const video = videoRef.current;
    if (video) {
      console.log("Seek", seekPosition * video.duration);
      video.currentTime = seekPosition * video.duration;
    }
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      handleSeek(e);
    }
  };

  return (
    <div
      ref={seekbarRef}
      className="seekbar"
      onClick={handleSeek}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseUp}>
      <div className="progress-bar" style={{ width: `${progress}%` }} />
    </div>
  );
}

export default function ReplayVideo({ src, onClose }: ReplayVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isRewinding, setIsRewinding] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  function rewind() {
    setIsRewinding(true);
    rewindVideo(videoRef.current!, () => {
      setIsRewinding(false);
      videoRef.current!.play();
    });
  }

  function stepForward() {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime += 1 / 60;
    }
  }

  function stepBackward() {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime -= 1 / 60;
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handleLoadedMetadata() {
      setIsLoaded(true);
      rewind();
    }

    function handleTimeUpdate() {
      setIsPlaying(isVideoPlaying(video!));
      setIsEnded(video!.ended);
      setCurrentTime(video!.currentTime);
    }

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handleTimeUpdate);
    video.addEventListener("pause", handleTimeUpdate);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handleTimeUpdate);
      video.removeEventListener("pause", handleTimeUpdate);
    };
  }, [src]);

  let actionIcon = "start";
  if (isEnded) {
    actionIcon = "restart";
  } else if (isPlaying) {
    actionIcon = "pause";
  }

  return (
    <>
      <ReplayOverlay time={currentTime} onClose={onClose} />
      <video ref={videoRef} src={src} className="phone-screen replay-video" />
      {isRewinding && <VHSRewind />}
      {!isRewinding && (
        <div className="phone-screen">
          <div className="replay-controls">
            <span className="replay-controls-pad" />
            <Button
              onClick={() => {
                if (videoRef.current) {
                  if (isVideoPlaying(videoRef.current)) {
                    videoRef.current.pause();
                  } else {
                    videoRef.current.play();
                  }
                }
              }}>
              <span className={`codicon codicon-debug-${actionIcon}`} />
            </Button>
            <Seekbar videoRef={videoRef} />
            <div style={{ display: "flex", flexDirection: "row" }}>
              <Button onClick={stepBackward}>
                <span className="codicon codicon-triangle-left" />
              </Button>
              <Button onClick={stepForward}>
                <span className="codicon codicon-triangle-right" />
              </Button>
            </div>
            <span className="replay-controls-pad" />
          </div>
        </div>
      )}
    </>
  );
}
