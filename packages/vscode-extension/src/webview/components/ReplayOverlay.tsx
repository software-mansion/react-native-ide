import { useEffect, useRef, useState } from "react";
import * as Select from "@radix-ui/react-select";
import { RecordingData } from "../../common/Project";
import { useUtils } from "../providers/UtilsProvider";
import "./ReplayOverlay.css";
import Button from "./shared/Button";

const INITIAL_REPLAY_LENGTH_SEC = 5;

/**
 * Setting negative playbackRate doesn't work in VSCode's WebView, so the rewinding
 * is done using requestAnimationFrame with a custom acceleration curve, such that
 * the rewinding speeds up over time and also takes a fixed amount of time to rewind.
 */
function acceleratedRewind(
  video: HTMLVideoElement,
  fromTime: number,
  toTime: number,
  readyCallback: () => void
) {
  const rewindTimeSec = 1.6;

  const v0 = 0.1;
  const vFinal = 2 / rewindTimeSec - v0;
  const acc = (vFinal - v0) / rewindTimeSec;

  const rewindTime = fromTime - toTime;
  video.currentTime = fromTime;

  let startTimeMs: number | null = null;
  function frame(timestampMs: number) {
    if (!startTimeMs) {
      startTimeMs = timestampMs;
    }
    const elapsedSec = Math.min((timestampMs - startTimeMs) / 1000, rewindTimeSec);

    const progress = v0 * elapsedSec + 0.5 * acc * elapsedSec * elapsedSec;

    if (elapsedSec < rewindTimeSec) {
      video.currentTime = Math.max(0, toTime + rewindTime * (1 - progress));
      requestAnimationFrame(frame);
    } else {
      console.log("Fin rewind", toTime);
      video.currentTime = toTime;
      readyCallback();
    }
  }
  requestAnimationFrame(frame);
}

function isVideoPlaying(videoElement: HTMLVideoElement) {
  return !videoElement.paused && !videoElement.ended && videoElement.readyState > 2;
}

interface SeekbarProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  startTime: number;
}

function Seekbar({ videoRef, startTime }: SeekbarProps) {
  const [progress, setProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const seekbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const updateProgress = () => {
      const newProgress = ((video.currentTime - startTime) / (video.duration - startTime)) * 100;
      setProgress(newProgress);
    };
    updateProgress();

    video.addEventListener("timeupdate", updateProgress);
    return () => video.removeEventListener("timeupdate", updateProgress);
  }, [videoRef, startTime]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const seekbar = seekbarRef.current;
    if (!seekbar) {
      return;
    }

    const rect = seekbar.getBoundingClientRect();
    const seekPosition = (e.clientX - rect.left) / rect.width;
    const video = videoRef.current;
    if (video) {
      video.currentTime = startTime + seekPosition * (video.duration - startTime);
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

interface LengthSelectorProps {
  startTime: number;
  videoRef: React.RefObject<HTMLVideoElement>;
  setStartTime: (startTime: number) => void;
}

function LengthSelector({ startTime, videoRef, setStartTime }: LengthSelectorProps) {
  const videoDuration = videoRef.current?.duration ?? 0;

  const options = [5, 10, 30, 0].filter((l) => l < videoDuration);
  const value = startTime === 0 ? 0 : videoDuration - startTime;

  function str(length: number) {
    if (length === 0) {
      return "Full";
    }
    return `${length}s`;
  }

  function onValueChange(newValue: string) {
    if (newValue === "Full") {
      setStartTime(0);
    } else {
      const newStartTime = videoDuration - parseInt(newValue);
      setStartTime(newStartTime);
    }
  }

  return (
    <Select.Root value={str(value)} onValueChange={onValueChange}>
      <Select.Trigger className="len-select-trigger" aria-label="Replay Len">
        <Select.Value>{str(value)}</Select.Value>
        <Select.Icon className="len-select-icon">
          <span className="codicon codicon-chevron-up" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="len-select-content">
          <Select.Viewport className="len-select-viewport">
            {options.map((length) => (
              <Select.Item value={str(length)} key={length} className="len-select-item">
                <Select.ItemText>{str(length)}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

type ReplayOverlayProps = {
  replayData: RecordingData;
  isRewinding: boolean;
  setIsRewinding: React.Dispatch<React.SetStateAction<boolean>>;
  videoRef: React.RefObject<HTMLVideoElement>;
  onClose: () => void;
};

export default function ReplayOverlay({
  isRewinding,
  setIsRewinding,
  videoRef,
  onClose,
  replayData,
}: ReplayOverlayProps) {
  const utils = useUtils();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [time, setCurrentTime] = useState(0);

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
    if (video === null) {
      return;
    }

    function handleLoadedMetadata() {
      setIsRewinding(true);
      const newStartTime = Math.max(0, video!.duration - INITIAL_REPLAY_LENGTH_SEC);
      setStartTime(newStartTime);
      acceleratedRewind(video!, video!.duration, newStartTime, () => {
        setIsRewinding(false);
        videoRef.current!.play();
      });
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
  }, [replayData.url]);

  let actionIcon = "start";
  if (isEnded) {
    actionIcon = "restart";
  } else if (isPlaying) {
    actionIcon = "pause";
  }

  function handleStartTimeChange(newStartTime: number) {
    setStartTime(newStartTime);
    const currentTime = videoRef.current?.currentTime ?? newStartTime;
    if (currentTime < newStartTime) {
      videoRef.current!.currentTime = newStartTime;
    }
    if (isEnded) {
      videoRef.current!.currentTime = newStartTime;
      videoRef.current!.play();
    }
  }

  // shifting the time a bit here such that it displays the final value properly despite using Math.floor
  const timeSec = Math.floor(time - startTime + 0.05);
  const timeFormat = `${Math.floor(timeSec / 60)}:${(timeSec % 60).toString().padStart(2, "0")}`;
  return (
    <div className="replay-overlay">
      <div className="replay-corner replay-top-left" />
      <div className="replay-corner replay-top-right" />
      <div className="replay-corner replay-bottom-left" />
      <div className="replay-corner replay-bottom-right" />
      <div className="replay-rec-indicator">
        <div className="replay-rec-dot" />
        <span>REPLAY {timeFormat}</span>
      </div>
      <Button onClick={onClose} className="button-absolute replay-close">
        <span className="codicon codicon-chrome-close" />
      </Button>

      {!isRewinding && (
        <div className="replay-controls">
          <span className="replay-controls-pad" />
          <LengthSelector
            videoRef={videoRef}
            startTime={startTime}
            setStartTime={handleStartTimeChange}
          />
          <Button
            className="button-replay"
            onClick={() => {
              if (videoRef.current) {
                if (isVideoPlaying(videoRef.current)) {
                  videoRef.current.pause();
                } else if (isEnded) {
                  videoRef.current.currentTime = startTime;
                  videoRef.current.play();
                } else {
                  videoRef.current.play();
                }
              }
            }}>
            <span className={`codicon codicon-debug-${actionIcon}`} />
          </Button>
          <Seekbar videoRef={videoRef} startTime={startTime} />
          <div style={{ display: "flex", flexDirection: "row" }}>
            <Button
              className="button-replay"
              onClick={stepBackward}
              tooltip={{
                label: "Previous frame",
                type: "secondary",
              }}>
              <span className="codicon codicon-triangle-left" />
            </Button>
            <Button
              className="button-replay"
              onClick={stepForward}
              tooltip={{
                label: "Next frame",
                type: "secondary",
              }}>
              <span className="codicon codicon-triangle-right" />
            </Button>
            <Button className="button-replay" onClick={() => utils.saveVideoRecording(replayData)}>
              <span className="codicon codicon-save-as" /> Save
            </Button>
          </div>
          <span className="replay-controls-pad" />
        </div>
      )}
    </div>
  );
}
