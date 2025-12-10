import React, { useRef, useState, useEffect } from "react";
import { parseGIF, decompressFrames } from "gifuct-js";

const ASCII_CHARS = "@%#*+=-:. "; // dark -> light
const DEFAULT_WIDTH = 80;
 
type FrameAscii = string[]; // array of lines

function rgbToLum(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function imageDataToAscii(imgData: ImageData, width: number, alphaThreshold = 16): FrameAscii {
  const { data, width: w, height: h } = imgData;
  const ratio = h / w;
  const targetWidth = width;
  const targetHeight = Math.max(1, Math.round(ratio * targetWidth * 0.5));
  // create a temporary canvas to resize
  const tmp = document.createElement("canvas");
  tmp.width = targetWidth;
  tmp.height = targetHeight;
  const ctx = tmp.getContext("2d")!;
  // draw original onto an offscreen canvas and scale
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d")!;
  sctx.putImageData(imgData, 0, 0);
  ctx.drawImage(src, 0, 0, w, h, 0, 0, targetWidth, targetHeight);
  const resized = ctx.getImageData(0, 0, targetWidth, targetHeight);

  const lines: string[] = [];
  for (let y = 0; y < resized.height; y++) {
    let row = "";
    for (let x = 0; x < resized.width; x++) {
      const i = (y * resized.width + x) * 4;
      const r = resized.data[i];
      const g = resized.data[i + 1];
      const b = resized.data[i + 2];
      const a = resized.data[i + 3];
      if (a < alphaThreshold) {
        row += " ";
      } else {
        const lum = rgbToLum(r, g, b) / 255;
        const idx = Math.round(lum * (ASCII_CHARS.length - 1));
        row += ASCII_CHARS[idx];
      }
    }
    lines.push(row);
  }
  return lines;
}

export default function App() {
  const [gifUrl, setGifUrl] = useState("");
  const [frames, setFrames] = useState<FrameAscii[] | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [fps, setFps] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [alphaThreshold, setAlphaThreshold] = useState(16);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!frames) return;
    if (playing) {
      const delay = Math.max(1, Math.round(1000 / fps));
      timerRef.current = window.setInterval(() => {
        setIndex((i) => (i + 1) % frames.length);
      }, delay);
      return () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
      };
    } else {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [playing, fps, frames]);

  const decodeGifFromBytes = async (bytes: Uint8Array) => {
    const gif = parseGIF(bytes.buffer);
    const decompressed = decompressFrames(gif, true);
    // decompressed frames have patch (RGBA) and dims, but we will render each full frame to canvas
    // create offscreen canvas with GIF's logical width/height
    const logicalWidth = gif.lsd.width;
    const logicalHeight = gif.lsd.height;
    const canvas = document.createElement("canvas");
    canvas.width = logicalWidth;
    canvas.height = logicalHeight;
    const ctx = canvas.getContext("2d")!;
    // clear
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    const asciiFrames: FrameAscii[] = [];

    for (const f of decompressed) {
      // each frame has patch (Uint8ClampedArray) with RGBA and a dims object
      // create ImageData for the frame's patch and draw at offset
      if (f.patch) {
        const imageData = new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height);
        // draw onto the logical canvas at (f.dims.left, f.dims.top)
        ctx.putImageData(imageData, f.dims.left, f.dims.top);
      }
      // now get full frame imageData
      const full = ctx.getImageData(0, 0, logicalWidth, logicalHeight);
      const ascii = imageDataToAscii(full, width, alphaThreshold);
      asciiFrames.push(ascii);

      // Respect disposal if provided: gifuct-js sets disposalType and we should handle 2 or 3.
      // disposalType: 1 = do not dispose, 2 = restore to background, 3 = restore to previous
      const disposalType = f.disposalType;
      if (disposalType === 2) {
        // clear the frame area to transparent
        ctx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
      } else if (disposalType === 3) {
        // not implemented — fallback: clear
        ctx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
      }
    }
    setFrames(asciiFrames);
    setIndex(0);
  };

  const handleConvertUrl = async () => {
    if (!gifUrl) return;
    try {
      const resp = await fetch(gifUrl);
      if (!resp.ok) throw new Error("Failed to fetch GIF");
      const arr = new Uint8Array(await resp.arrayBuffer());
      await decodeGifFromBytes(arr);
    } catch (err: any) {
      alert("Error: " + (err.message || err));
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const arr = new Uint8Array(await file.arrayBuffer());
    await decodeGifFromBytes(arr);
  };

  const downloadJson = () => {
    if (!frames) return;
    const payload = JSON.stringify(frames, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "animation.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyFrameEdit = (text: string) => {
    if (!frames) return;
    const lines = text.split("\n");
    const newFrames = frames.slice();
    newFrames[index] = lines;
    setFrames(newFrames);
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Roboto, Arial" }}>
      <h2>GIF → ASCII (Spirit — client-side)</h2>
      <div style={{ display: "flex", gap: 12 }}>
        <input
          style={{ flex: 1 }}
          placeholder="GIF URL"
          value={gifUrl}
          onChange={(e) => setGifUrl(e.target.value)}
        />
        <button onClick={handleConvertUrl}>Convert URL</button>
        <input
          type="file"
          accept="image/gif"
          ref={fileInputRef}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <label>
          Width:
          <input type="number" value={width} onChange={(e) => setWidth(parseInt(e.target.value) || DEFAULT_WIDTH)} />
        </label>
        <label>
          FPS:
          <input type="number" value={fps} onChange={(e) => setFps(parseInt(e.target.value) || 12)} />
        </label>
        <label>
          Alpha threshold (0-255):
          <input type="number" value={alphaThreshold} onChange={(e) => setAlphaThreshold(parseInt(e.target.value) || 16)} />
        </label>
        <button onClick={() => { if (frames) decodeGifFromBytes(new Uint8Array()); }}>Re-render (width change)</button>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <h3>Preview</h3>
          <pre style={{ background: "#000", color: "#ddd", padding: 10, height: 420, overflow: "auto", lineHeight: 1 }}>
            {frames ? (frames[index].join("\n")) : "No frames yet."}
          </pre>
          <div>
            <button disabled={!frames} onClick={() => setIndex((i) => (frames ? (i - 1 + frames.length) % frames.length : i))}>◀ Prev</button>
            <button disabled={!frames} onClick={() => setPlaying(true)}>Play ▶</button>
            <button disabled={!frames} onClick={() => setPlaying(false)}>Stop ■</button>
            <button disabled={!frames} onClick={() => setIndex((i) => (frames ? (i + 1) % frames.length : i))}>Next ▶</button>
            <span style={{ marginLeft: 12 }}>{frames ? `${index + 1} / ${frames.length}` : ""}</span>
            <button style={{ marginLeft: 12 }} disabled={!frames} onClick={downloadJson}>Download JSON</button>
          </div>
        </div>

        <div style={{ width: 360 }}>
          <h4>Edit current frame</h4>
          <textarea
            style={{ width: "100%", height: 300, fontFamily: "monospace" }}
            defaultValue={frames ? frames[index].join("\n") : ""}
            onBlur={(e) => applyFrameEdit(e.target.value)}
          />
          <p>Tip: edit the textarea and click outside to apply.</p>
        </div>
      </div>
    </div>
  );
}
