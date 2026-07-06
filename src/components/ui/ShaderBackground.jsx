import { useEffect, useRef } from 'react';
import {
  MessageCircle, Video, Instagram, Facebook, Twitter, Youtube, Globe, Smartphone,
} from 'lucide-react';

const VS_SOURCE = `
  attribute vec4 aVertexPosition;
  void main() { gl_Position = aVertexPosition; }
`;

const FS_SOURCE = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;

  const float overallSpeed = 0.2;
  const float gridSmoothWidth = 0.015;
  const float scale = 5.0;

  const vec4 lineColor = vec4(0.93, 0.16, 0.16, 0.4);
  const vec4 nodeColor = vec4(1.0, 1.0, 1.0, 1.0);
  const vec4 bgColor1 = vec4(0.04, 0.13, 0.26, 1.0); // #0B2143 deep navy base
  const vec4 bgColor2 = vec4(0.06, 0.18, 0.38, 1.0); // deep royal highlight

  const float minLineWidth = 0.008;
  const float maxLineWidth = 0.08;
  const float lineSpeed = 1.0 * overallSpeed;
  const float lineAmplitude = 1.2;
  const float lineFrequency = 0.2;

  const float warpSpeed = 0.2 * overallSpeed;
  const float warpFrequency = 0.6;
  const float warpAmplitude = 1.5;

  const int linesPerGroup = 14;

  #define drawCircle(pos, radius, coord) smoothstep(radius + gridSmoothWidth, radius, length(coord - (pos)))
  #define drawSmoothLine(pos, halfWidth, t) smoothstep(halfWidth, 0.0, abs(pos - (t)))
  #define drawCrispLine(pos, halfWidth, t) smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - (t)))

  float random(float t) {
    return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
  }

  float getPlasmaY(float x, float horizontalFade, float offset) {
    float wave = sin(x * 0.5 + iTime * lineSpeed) * 0.5;
    return random(x * lineFrequency + iTime * lineSpeed) * horizontalFade * lineAmplitude + offset + wave;
  }

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec4 fragColor;
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 space = (fragCoord - iResolution.xy / 2.0) / iResolution.x * 2.0 * scale;

    float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
    float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);

    space.y += sin(space.x * warpFrequency + iTime * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
    space.x += cos(space.y * warpFrequency + iTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade;

    vec4 lines = vec4(0.0);

    for (int l = 0; l < linesPerGroup; l++) {
      float normalizedLineIndex = float(l) / float(linesPerGroup);
      float offsetTime = iTime * 0.15;
      float offsetPosition = float(l) + space.x * 0.5;
      float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
      float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;

      float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * 2.0;
      float linePosition = getPlasmaY(space.x, horizontalFade, offset);

      float line = drawSmoothLine(linePosition, halfWidth, space.y) * 0.5
                 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);

      float circleX = mod(float(l) * 4.0 + iTime * lineSpeed * 2.5, 20.0) - 10.0;
      vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, horizontalFade, offset));
      float circle = drawCircle(circlePosition, 0.025, space) * 3.0;

      lines += line * lineColor * rand;
      lines += circle * nodeColor * rand * (1.0 - horizontalFade * 0.2);
    }

    fragColor = mix(bgColor1, bgColor2, uv.y);
    fragColor += lines;
    fragColor *= (verticalFade * 0.3 + 0.7); // edge vignetting
    fragColor.a = 1.0;

    gl_FragColor = fragColor;
  }
`;

const FLOATING_ICONS = [
  { Icon: MessageCircle, delay: '0s',   left: '15%', size: 38, glow: '37, 211, 102'  }, // WhatsApp green
  { Icon: Video,         delay: '2.5s', left: '80%', size: 34, glow: '255, 0, 80'    }, // TikTok red-pink
  { Icon: Instagram,     delay: '4s',   left: '35%', size: 42, glow: '225, 48, 108'  }, // Instagram pink
  { Icon: Facebook,      delay: '1s',   left: '65%', size: 32, glow: '24, 119, 242'  }, // Facebook blue
  { Icon: Twitter,       delay: '5s',   left: '50%', size: 36, glow: '29, 161, 242'  }, // Twitter/X cyan
  { Icon: Youtube,       delay: '3.5s', left: '22%', size: 38, glow: '255, 0, 0'     }, // YouTube red
  { Icon: Smartphone,    delay: '6s',   left: '88%', size: 30, glow: '245, 181, 0'   }, // brand yellow
  { Icon: Globe,         delay: '0.5s', left: '5%',  size: 45, glow: '148, 163, 184' }, // slate white
];

const SHADER_CSS = `
  @keyframes floatUp {
    0%   { transform: translateY(110vh) scale(0.8) rotate(-10deg); opacity: 0; }
    15%  { opacity: 0.6; }
    85%  { opacity: 0.6; }
    100% { transform: translateY(-20vh) scale(1.2) rotate(10deg); opacity: 0; }
  }
  .tech-icon-float {
    position: absolute;
    bottom: -60px;
    animation: floatUp 16s linear infinite;
    color: rgba(255, 255, 255, 0.55);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
  }
  .tech-icon-float svg { display: block; }
  .tech-icon-float:hover {
    color: #ffffff;
    transform: scale(1.6) translateY(-10px) !important;
    z-index: 50;
  }
`;

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

export default function ShaderBackground({
  className = 'fixed top-0 left-0 w-full h-full -z-10 bg-[#0B2143]',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]),
      gl.STATIC_DRAW,
    );

    const vertexPosition = gl.getAttribLocation(program, 'aVertexPosition');
    const resolutionUniform = gl.getUniformLocation(program, 'iResolution');
    const timeUniform = gl.getUniformLocation(program, 'iTime');

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener('resize', resize);
    resize();

    const startTime = Date.now();
    let rafId = 0;

    const render = () => {
      const t = (Date.now() - startTime) / 1000;
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
      gl.uniform1f(timeUniform, t);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(vertexPosition, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(vertexPosition);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className={className}>
      <style>{SHADER_CSS}</style>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {FLOATING_ICONS.map((item, idx) => (
          <div
            key={idx}
            className="tech-icon-float pointer-events-auto"
            style={{
              left: item.left,
              animationDelay: item.delay,
              animationDuration: `${16 + (idx % 4) * 2}s`,
              filter: `drop-shadow(0 0 12px rgba(${item.glow}, 0.6)) drop-shadow(0 0 22px rgba(${item.glow}, 0.35))`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = `drop-shadow(0 0 22px rgba(${item.glow}, 1)) drop-shadow(0 0 40px rgba(${item.glow}, 0.6))`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = `drop-shadow(0 0 12px rgba(${item.glow}, 0.6)) drop-shadow(0 0 22px rgba(${item.glow}, 0.35))`;
            }}
          >
            <item.Icon size={item.size} strokeWidth={1.5} />
          </div>
        ))}
      </div>
    </div>
  );
}
