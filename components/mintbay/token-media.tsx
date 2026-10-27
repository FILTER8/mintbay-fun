
'use client';

import { useEffect, useRef, useState } from 'react';
import { Expand, Image as ImageIcon, Play } from 'lucide-react';

interface TokenMediaProps {
  image: string | null;
  animationUrl?: string | null;
  name: string;
}

export function TokenMedia({
  image,
  animationUrl,
  name,
}: TokenMediaProps) {
  const playable =
    typeof animationUrl === 'string' &&
    /^(data:text\/html(?:;charset=[^;,]+)?;base64,|https:\/\/)/i.test(
      animationUrl
    );

  const [mode, setMode] = useState<'image' | 'animation'>(
    playable ? 'animation' : 'image'
  );

  const mediaRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Keep fullscreen state synchronized, including when ESC is pressed.
  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(
        document.fullscreenElement === mediaRef.current
      );
    };

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange
      );
    };
  }, []);

  async function openFullscreen() {
    const node = mediaRef.current;
    if (!node) return;

    try {
      if (document.fullscreenElement === node) {
        await document.exitFullscreen();
      } else if (node.requestFullscreen) {
        await node.requestFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen request failed:', error);
    }
  }

  return (
    <div className="mb-token-media-shell">
      <div className="mb-token-media-controls">
        <div
          className="mb-token-media-tabs"
          role="group"
          aria-label="Token media"
        >
          <button
            type="button"
            onClick={() => setMode('image')}
            aria-pressed={mode === 'image'}
            disabled={!image}
            className={mode === 'image' ? 'active' : ''}
          >
            <ImageIcon size={14} />
            IMAGE
          </button>

          {playable && (
            <button
              type="button"
              onClick={() => setMode('animation')}
              aria-pressed={mode === 'animation'}
              className={mode === 'animation' ? 'active' : ''}
            >
              <Play size={14} />
              ANIMATION
            </button>
          )}
        </div>

        <button
          type="button"
          className="mb-token-media-fullscreen"
          onClick={openFullscreen}
          aria-label="Fullscreen media"
          title="Fullscreen"
        >
          <Expand size={18} />
        </button>
      </div>

      <div
        ref={mediaRef}
        className="mb-token-media-stage"
      >
        {playable && mode === 'animation' ? (
          <iframe
            key={animationUrl}
            title={`${name} interactive animation`}
            src={animationUrl!}
            sandbox="allow-scripts"
            allow="fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        ) : image ? (
          <img src={image} alt={name} />
        ) : (
          <span>NO IMAGE</span>
        )}

        {fullscreen && (
          <button
            className="mb-token-media-exit"
            type="button"
            onClick={openFullscreen}
          >
            EXIT FULLSCREEN ×
          </button>
        )}
      </div>

      <style jsx>{`
        .mb-token-media-shell {
          width: 100%;
          max-width: 650px;
          min-width: 0;
        }

        .mb-token-media-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }

        .mb-token-media-tabs {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .mb-token-media-controls button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px 12px;
          border: 1px solid currentColor;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          background: transparent;
          color: inherit;
        }

        .mb-token-media-controls button.active {
          color: #111;
          background: #ceff45;
        }

        .mb-token-media-controls button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .mb-token-media-stage {
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #e8e9e3;
          color: #111;
        }

        .mb-token-media-stage img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          image-rendering: pixelated;
        }

        .mb-token-media-stage iframe {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
          background: #000;
        }

        .mb-token-media-stage:fullscreen {
          width: 100vw;
          height: 100vh;
          aspect-ratio: auto;
          background: #000;
        }

        .mb-token-media-stage:fullscreen img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .mb-token-media-exit {
          position: absolute;
          z-index: 2;
          top: 12px;
          right: 12px;
          padding: 9px 12px;
          border: 1px solid #fff;
          background: #000;
          color: #fff;
          font-weight: bold;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
