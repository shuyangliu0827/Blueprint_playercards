import type { Material, Uniforms, Texture, Mask } from './types';
import { assetUrl, loadImage } from '../platform/web';
const vertex = `attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=vec2(a_position.x*.5+.5,.5-a_position.y*.5);gl_Position=vec4(a_position,0.,1.);}`;
const fragment = `precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_normal;uniform sampler2D u_noise;uniform sampler2D u_cover;uniform sampler2D u_protect;
uniform vec4 u_normalUv;uniform vec4 u_noiseUv;uniform float u_normalRotation;uniform float u_noiseRotation;
uniform float u_normalSrgb;uniform float u_noiseSrgb;uniform float u_hasNormal;uniform float u_hasNoise;
uniform vec4 u_coverChannel;uniform vec4 u_protectChannel;uniform float u_coverInvert;uniform float u_protectInvert;
uniform float u_strength;uniform float u_dispersion;uniform float u_specularSharpness;uniform float u_normalScale;uniform float u_noiseScale;uniform float u_noiseStrength;uniform float u_roughness;uniform float u_anisotropy;uniform float u_ambient;uniform float u_tiltX;uniform float u_tiltY;
uniform vec4 u_tint;uniform vec4 u_specularColor;uniform vec3 u_lightDirection;
vec2 texuv(vec2 uv,vec4 transform,float rotation){float c=cos(rotation),s=sin(rotation);return fract(mat2(c,-s,s,c)*(uv-.5)*transform.xy+.5+transform.zw);}
void main(){
 vec2 uv=v_uv;vec3 normalTex=texture2D(u_normal,texuv(uv,u_normalUv,u_normalRotation)).rgb;normalTex=mix(normalTex,pow(normalTex,vec3(2.2)),u_normalSrgb);vec3 n=mix(vec3(0.,0.,1.),normalTex*2.-1.,u_hasNormal);n=normalize(vec3(n.xy*u_normalScale,max(.15,n.z)));
 float noise=texture2D(u_noise,texuv(uv*u_noiseScale,u_noiseUv,u_noiseRotation)).r;noise=mix(noise,pow(noise,2.2),u_noiseSrgb);noise=mix(.5,noise,u_hasNoise);
 n=normalize(n+vec3((noise-.5)*u_noiseStrength,(noise-.5)*u_noiseStrength,0.));
 vec3 view=normalize(vec3(u_tiltX,u_tiltY,1.));vec3 halfVector=normalize(normalize(u_lightDirection)+view);
 float spec=pow(max(dot(n,halfVector),0.),u_specularSharpness*(1.-.7*u_roughness));
 float diagonal=uv.x*1.3+uv.y*.78+u_tiltX*.65+u_tiltY*.48;
 float band=pow(max(0.,1.-abs(fract(diagonal*.82)-.5)*2.),mix(10.,28.,abs(u_anisotropy)));
 vec3 spectrum=.5+.5*cos(6.2831853*(vec3(0.,.33,.67)+diagonal*1.3+noise*.14));
 vec3 color=mix(u_tint.rgb,spectrum,u_dispersion);color=mix(color,u_specularColor.rgb,spec*.65);
 float cover=dot(texture2D(u_cover,uv),u_coverChannel);cover=mix(cover,1.-cover,u_coverInvert);
 float protect=dot(texture2D(u_protect,uv),u_protectChannel);protect=mix(protect,1.-protect,u_protectInvert);
 float alpha=clamp((u_ambient+spec*.55+band*.58)*u_strength*cover*(1.-protect)*u_tint.a,0.,.72);
 gl_FragColor=vec4(color,alpha);
}`;
function rgba(hex: string) {
  return [1, 3, 5, 7].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
function channel(mask: Mask) {
  return mask.channel === 'luminance'
    ? [0.2126, 0.7152, 0.0722, 0]
    : ['r', 'g', 'b', 'a'].map((c) => Number(c === mask.channel));
}
export interface MaterialRenderer {
  draw(uniforms: Uniforms): void;
  dispose(releaseContext?: boolean): void;
  canvas: HTMLCanvasElement;
}
/** One quad, one WebGL1 shader; effects never use CSS or a 2D painter. */
export async function createMaterialRenderer(
  canvas: HTMLCanvasElement,
  material: Material,
): Promise<MaterialRenderer> {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    antialias: false,
  });
  if (!gl) throw new Error('WebGL unavailable');
  const shaders: WebGLShader[] = [];
  const textures: WebGLTexture[] = [];
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
    shaders.push(shader);
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error('Material program link failed');
  gl.useProgram(program);
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const loc = (name: string) => gl.getUniformLocation(program, `u_${name}`);
  const entries: [string, string | null, Texture | null][] = [
    ['normal', material.textures.normal?.assetRef ?? null, material.textures.normal],
    ['noise', material.textures.noise?.assetRef ?? null, material.textures.noise],
    ['cover', material.coverageMask.assetRef, null],
    ['protect', material.protectMask.assetRef, null],
  ];
  try {
    await Promise.all(
      entries.map(async ([name, ref, settings], i) => {
        const image = ref ? await loadImage(assetUrl(ref)) : null;
        const texture = gl.createTexture()!;
        textures.push(texture);
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        else
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array([128, 128, 255, 255]),
          );
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          settings?.filter === 'nearest' ? gl.NEAREST : gl.LINEAR,
        );
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MAG_FILTER,
          settings?.filter === 'nearest' ? gl.NEAREST : gl.LINEAR,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(loc(name), i);
      }),
    );
  } catch (e) {
    textures.forEach((t) => gl.deleteTexture(t));
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    shaders.forEach((s) => gl.deleteShader(s));
    throw e;
  }
  for (const key of ['normal', 'noise'] as const) {
    const t = material.textures[key];
    gl.uniform4fv(loc(`${key}Uv`), [...(t?.uvScale ?? [1, 1]), ...(t?.uvOffset ?? [0, 0])]);
    gl.uniform1f(loc(`${key}Rotation`), ((t?.rotationDeg ?? 0) * Math.PI) / 180);
    gl.uniform1f(loc(`${key}Srgb`), Number(t?.colorSpace === 'srgb'));
    gl.uniform1f(loc(key === 'normal' ? 'hasNormal' : 'hasNoise'), Number(Boolean(t)));
  }
  gl.uniform4fv(loc('coverChannel'), channel(material.coverageMask));
  gl.uniform4fv(loc('protectChannel'), channel(material.protectMask));
  gl.uniform1f(loc('coverInvert'), Number(material.coverageMask.invert));
  gl.uniform1f(loc('protectInvert'), Number(material.protectMask.invert));
  return {
    canvas,
    draw(u) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (const [k, v] of Object.entries(u)) {
        if (typeof v === 'number') gl.uniform1f(loc(k), v);
        else if (typeof v === 'string') gl.uniform4fv(loc(k), rgba(v));
        else gl.uniform3fv(loc(k), v);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose(releaseContext = false) {
      textures.forEach((t) => gl.deleteTexture(t));
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      shaders.forEach((s) => gl.deleteShader(s));
      if (releaseContext) gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
