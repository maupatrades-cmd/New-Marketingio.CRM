export default function CircuitBackground({ className = '' }) {
  // Generate deterministic circuit nodes and traces
  const gridSize = 40;
  const cols = 25;
  const rows = 18;
  const hash = (x, y) => ((x * 7919 + y * 104729) % 100);

  const elements = [];
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const px = x * gridSize + gridSize / 2;
      const py = y * gridSize + gridSize / 2;
      const h = hash(x, y);

      // 25% chance of a node
      if (h < 25) {
        const isAccent = h < 4;
        elements.push(
          <circle key={`n-${x}-${y}`} cx={px} cy={py}
            r={isAccent ? 4 : 2.5}
            fill={isAccent ? 'rgba(226,41,59,0.15)' : 'rgba(11,33,67,0.08)'}
            style={isAccent ? { animation: `circuitPulse 2.4s ease-in-out ${(x + y) * 0.3}s infinite` } : undefined}
          />
        );
        // Accent glow ring
        if (isAccent) {
          elements.push(
            <circle key={`g-${x}-${y}`} cx={px} cy={py} r={10}
              fill="none" stroke="rgba(226,41,59,0.08)" strokeWidth="0.5"
              style={{ animation: `circuitRing 3s ease-out ${(x + y) * 0.3}s infinite` }}
            />
          );
        }
      }

      // Horizontal traces
      if (h > 20 && h < 55 && x < cols - 1 && hash(x + 1, y) < 25) {
        elements.push(
          <line key={`th-${x}-${y}`} x1={px} y1={py} x2={px + gridSize} y2={py}
            stroke={h < 25 ? 'rgba(226,41,59,0.06)' : 'rgba(11,33,67,0.05)'}
            strokeWidth="1" strokeDasharray={h < 35 ? 'none' : '4 4'}
          />
        );
      }

      // Vertical traces
      if (h > 30 && h < 60 && y < rows - 1 && hash(x, y + 1) < 25) {
        elements.push(
          <line key={`tv-${x}-${y}`} x1={px} y1={py} x2={px} y2={py + gridSize}
            stroke="rgba(11,33,67,0.05)" strokeWidth="1"
          />
        );
      }

      // Corner traces
      if (h > 60 && h < 72 && x < cols - 1 && y < rows - 1) {
        elements.push(
          <path key={`tc-${x}-${y}`}
            d={`M${px} ${py} L${px + gridSize} ${py} L${px + gridSize} ${py + gridSize}`}
            fill="none" stroke="rgba(11,33,67,0.04)" strokeWidth="0.8"
          />
        );
      }
    }
  }

  return (
    <div className={`pointer-events-none ${className}`}>
      <svg width="100%" height="100%" viewBox="0 0 1000 720" preserveAspectRatio="xMidYMid slice"
           xmlns="http://www.w3.org/2000/svg">
        {/* Faint grid dots */}
        <defs>
          <pattern id="circuitGrid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <circle cx={gridSize / 2} cy={gridSize / 2} r="0.5" fill="rgba(11,33,67,0.04)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#circuitGrid)" />
        {elements}
      </svg>
      <style>{`
        @keyframes circuitPulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.5; }
        }
        @keyframes circuitRing {
          0% { opacity: 0.1; transform-origin: center; transform: scale(0.8); }
          100% { opacity: 0; transform-origin: center; transform: scale(2); }
        }
      `}</style>
    </div>
  );
}
