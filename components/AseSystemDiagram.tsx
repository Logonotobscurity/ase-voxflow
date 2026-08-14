import React from 'react';

/**
 * A compact, original process illustration inspired by the supplied editorial
 * line-art reference. It explains how signals converge into governed action.
 */
export function AseSystemDiagram() {
  const pips = [0, 1, 2, 3];
  return (
    <svg
      className="ase-system-art"
      viewBox="0 0 560 720"
      role="img"
      aria-labelledby="ase-system-title ase-system-description"
    >
      <title id="ase-system-title">Ase operational workflow system</title>
      <desc id="ase-system-description">Voice, business events and offline work converge through decisions and controls into reliable business actions.</desc>

      <g className="art-lines" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M104 118v52c0 18 12 34 30 39l104 28c16 4 27 19 27 35v26" />
        <path d="M280 118v180" />
        <path d="M456 118v52c0 18-12 34-30 39l-104 28c-16 4-27 19-27 35v26" strokeDasharray="6 7" />
        <path d="M280 394v54c0 17-10 31-26 37l-94 35c-16 6-26 21-26 38v37" />
        <path d="M280 394v201" />
        <path d="M280 448c0 17 10 31 26 37l94 35c16 6 26 21 26 38v37" />
      </g>

      <g className="art-node">
        <circle cx="104" cy="82" r="36" />
        <path d="M91 80c5-18 21-18 26 0s21 18 26 0" fill="none" />
        <text x="104" y="142" textAnchor="middle">VOICE</text>
      </g>
      <g className="art-node">
        <rect x="244" y="46" width="72" height="72" rx="12" />
        <path d="M262 68h36M262 82h28M262 96h20" fill="none" />
        <text x="280" y="142" textAnchor="middle">EVENT</text>
      </g>
      <g className="art-node art-offline">
        <circle cx="456" cy="82" r="36" strokeDasharray="3 6" />
        <path d="M437 88h38M444 75l12-10 12 10" fill="none" />
        <text x="456" y="142" textAnchor="middle">OFFLINE</text>
      </g>

      <g className="art-diamond">
        <rect x="239" y="299" width="82" height="82" rx="12" transform="rotate(45 280 340)" />
        {pips.map((pip) => <rect key={pip} x={262 + pip * 10} y={336} width="5" height="5" rx="1" />)}
        <text x="280" y="418" textAnchor="middle">UNDERSTAND + ROUTE</text>
      </g>

      <g className="art-action">
        <rect x="82" y="594" width="104" height="76" rx="12" />
        <path d="M102 620h64M102 636h44" fill="none" />
        <text x="134" y="694" textAnchor="middle">PEOPLE</text>
      </g>
      <g className="art-action">
        <rect x="228" y="594" width="104" height="76" rx="12" />
        <circle cx="280" cy="632" r="18" fill="none" />
        <path d="m272 632 6 6 12-14" fill="none" />
        <text x="280" y="694" textAnchor="middle">CONTROL</text>
      </g>
      <g className="art-action">
        <rect x="374" y="594" width="104" height="76" rx="12" />
        <path d="M396 645h18v-28h18v28h18" fill="none" />
        <text x="426" y="694" textAnchor="middle">SYSTEMS</text>
      </g>

      <g className="signal-pips" fill="currentColor">
        {[208, 226, 244].map((y) => <rect key={y} x="276" y={y} width="8" height="8" rx="2" transform={`rotate(45 280 ${y + 4})`} />)}
        {[506, 528, 550].map((y) => <rect key={y} x="276" y={y} width="8" height="8" rx="2" transform={`rotate(45 280 ${y + 4})`} />)}
      </g>
    </svg>
  );
}
