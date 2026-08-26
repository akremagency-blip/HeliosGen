// 268 lines of selectors that had nothing to do with the component they were
// declared under. Moved verbatim.

export const GALLERY_CSS = `
  [data-prompt-input]::placeholder { color: rgba(255,255,255,0.3); }
  .picker-scroll { scrollbar-width: none; }
  .picker-scroll::-webkit-scrollbar { display: none; }
  .seed-input::-webkit-inner-spin-button, .seed-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pendingGlow {
    0%, 100% { opacity: 0.55; }
    50% { opacity: 1; }
  }
  @keyframes dlRingSpin {
    from { stroke-dashoffset: 75.4; transform: rotate(-90deg); }
    to   { stroke-dashoffset: 0;    transform: rotate(270deg); }
  }
  .dl-ring-spin { animation: dlRingSpin 1.4s linear infinite; transform-origin: center; }
  @keyframes dropIn {
    from { opacity: 0; transform: translateY(6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1);    }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes shimmer {
    0%   { background-position: -800px 0; }
    100% { background-position:  800px 0; }
  }
  .gallery-skeleton {
    width: 100%;
    background: linear-gradient(
      90deg,
      #222226 0px,
      #2e2e33 200px,
      #3a3a40 350px,
      #2e2e33 500px,
      #222226 700px
    );
    background-size: 800px 100%;
    animation: shimmer 1.6s ease-in-out infinite;
    border-radius: 2px;
  }
  @keyframes refImgIn {
    from { opacity: 0; transform: translateY(14px) scale(0.91); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }
  .gallery-zoom-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 90px;
    height: 3px;
    border-radius: 2px;
    background: rgba(255,255,255,0.14);
    outline: none;
    cursor: pointer;
  }
  .gallery-zoom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #ffffff;
    cursor: pointer;
    transition: transform 120ms;
  }
  .gallery-zoom-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
  .gallery-zoom-slider::-moz-range-thumb {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #ffffff;
    cursor: pointer;
    border: none;
  }
  @keyframes durPickerIn {
    from { opacity: 0; transform: translateY(6px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0)   scale(1);    }
  }
  @keyframes durPickerOut {
    from { opacity: 1; transform: translateY(0)   scale(1);    }
    to   { opacity: 0; transform: translateY(6px) scale(0.95); }
  }
  .dur-picker-in  { animation: durPickerIn  170ms cubic-bezier(0.16,1,0.3,1) both; }
  .dur-picker-out { animation: durPickerOut 160ms cubic-bezier(0.4,0,1,1)    both; }
  .dur-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 3px;
    border-radius: 2px;
    background: rgba(255,255,255,0.18);
    outline: none;
    cursor: pointer;
  }
  .dur-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    cursor: pointer;
    transition: transform 100ms;
  }
  .dur-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
  .dur-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    cursor: pointer;
    border: none;
  }
  @keyframes galleryItemIn {
    from { opacity: 0; transform: translateY(12px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }
  .gallery-item {
    position: relative;
    overflow: hidden;
    cursor: pointer;
    background: #222226;
    width: 100%;
    height: 100%;
    animation: galleryItemIn 450ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .gallery-actions-top {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    opacity: 0;
    transition: opacity 180ms ease;
    z-index: 5;
    pointer-events: none;
  }
  .gallery-item:hover .gallery-actions-top {
    opacity: 1;
    pointer-events: auto;
  }
  .error-pending-tile .error-tile-actions {
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease;
  }
  .error-pending-tile:hover .error-tile-actions {
    opacity: 1;
    pointer-events: auto;
  }
  .gallery-action-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(0,0,0,0.62);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: rgba(255,255,255,0.8);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 120ms, color 120ms;
    flex-shrink: 0;
    padding: 0;
  }
  .gallery-action-btn:hover {
    background: rgba(255,255,255,0.16);
    color: #ffffff;
  }
  .gallery-delete-btn:hover {
    background: rgba(255,255,255,0.16);
    color: #ef4444 !important;
  }
  .gallery-actions-bottom {
    position: absolute;
    bottom: 10px;
    right: 10px;
    opacity: 0;
    transition: opacity 180ms ease;
    z-index: 5;
    pointer-events: none;
  }
  .gallery-item:hover .gallery-actions-bottom {
    opacity: 1;
    pointer-events: auto;
  }
  .gallery-ref-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 11px 5px 9px;
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(0,0,0,0.62);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: #ffffff;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 120ms;
    font-family: inherit;
    letter-spacing: -0.01em;
    white-space: nowrap;
    padding: 5px 11px 5px 9px;
  }
  .gallery-ref-btn:hover {
    background: rgba(255,255,255,0.16);
  }
  .gallery-shimmer {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, #222226 25%, #2a2a2e 50%, #222226 75%);
    background-size: 800px 100%;
    animation: shimmer 1.6s infinite linear;
  }
  .gallery-item img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .gallery-item video { display: block; width: 100%; height: 100%; object-fit: cover; }
  [data-at-menu] { font-family: inherit; }
  .gallery-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 55%);
    opacity: 0; transition: opacity 180ms ease;
    display: flex; flex-direction: column; justify-content: flex-end; padding: 10px;
  }
  .gallery-item:hover .gallery-overlay { opacity: 1; }
  .gallery-play-icon {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 180ms ease; pointer-events: none;
  }
  .gallery-item:hover .gallery-play-icon { opacity: 1; }
  .gallery-checkbox {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 2px solid rgba(255,255,255,0.55);
    background: transparent;
    z-index: 6;
    opacity: 0;
    transition: opacity 150ms ease, border-color 120ms ease;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    cursor: pointer;
    flex-shrink: 0;
  }
  .gallery-item:hover .gallery-checkbox { opacity: 1; }
  .gallery-item--selected .gallery-checkbox {
    opacity: 1;
    border-color: #ffffff;
    background: #ffffff;
  }
  .gallery-item--anyselected .gallery-actions-top { display: none; }
  .gallery-item--anyselected .gallery-actions-bottom { display: none; }
  .gallery-item--anyselected .gallery-mute-btn { opacity: 0 !important; pointer-events: none !important; }
  .gallery-item--anyselected .gallery-overlay { opacity: 0 !important; }
  .gallery-item--anyselected { cursor: pointer; }
  .gallery-item--tagged { box-shadow: inset 0 0 0 2.5px #10b981; }
`;
