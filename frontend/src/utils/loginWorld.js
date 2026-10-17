import { BufferGeometry, DoubleSide, DynamicDrawUsage, InterleavedBuffer, InterleavedBufferAttribute, Mesh, OrthographicCamera, RawShaderMaterial, Scene, WebGLRenderer } from "three";

// Retains the reference's geometry, projection, palette and courier path.
export function createDeliveryWorld(canvas, fallback) {
  let renderer;
  const noWorld = () => ({ reset() {}, pause() {}, play() {}, dispose() {} });
  try { renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false }); }
  catch { fallback.style.display = "flex"; canvas.hidden = true; return noWorld(); }
  renderer.setClearColor(0, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera();
  const uniforms = { uAspect: { value: 1 }, uSize: { value: 2.6 }, uAngle: { value: .1 } };
  const materials = [];
  const batches = [false, true].map(transparent => {
    const data = new InterleavedBuffer(new Float32Array(65536 * 7), 7).setUsage(DynamicDrawUsage);
    const geometry = new BufferGeometry();
    geometry.setAttribute("aPosition", new InterleavedBufferAttribute(data, 3, 0));
    geometry.setAttribute("aColor", new InterleavedBufferAttribute(data, 4, 3));
    geometry.setDrawRange(0, 0);
    const material = new RawShaderMaterial({
      uniforms, vertexShader: "precision highp float;attribute vec3 aPosition;attribute vec4 aColor;uniform float uAspect;uniform float uSize;uniform float uAngle;varying vec4 vColor;void main(){vec3 p=aPosition;p.xz=mat2(cos(uAngle),-sin(uAngle),sin(uAngle),cos(uAngle))*p.xz;p.y-=1.0;vec3 right=vec3(.814,0.,-.581);vec3 up=vec3(-.30,.856,-.42);vec3 front=vec3(.497,.516,.699);gl_Position=vec4(dot(p,right)/(uSize*uAspect),dot(p,up)/uSize,-dot(p,front)/10.,1.);vColor=aColor;}",
      fragmentShader: "precision mediump float;varying vec4 vColor;void main(){gl_FragColor=vColor;}",
      transparent, depthWrite: !transparent, side: DoubleSide
    });
    materials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = transparent ? 1 : 0;
    scene.add(mesh);
    return { data, geometry };
  });
  const white=[.97,.975,1],pearl=[.86,.89,.96],blue=[.23,.35,.79],windowBlue=[.66,.73,.89],kraft=[.86,.69,.49];
  let vertices=[],translucent=[],time=0,last=0,frame=0,running=false,valid=true;
  const clamp=n=>Math.max(0,Math.min(1,n));const ease=n=>1-Math.pow(1-clamp(n),3);
  const point=(p,c,light=1,alpha=1)=>(alpha<1?translucent:vertices).push(...p,c[0]*light,c[1]*light,c[2]*light,alpha);
  function quad(a,b,c,d,col,l=1,alpha=1){[a,b,c,a,c,d].forEach(p=>point(p,col,l,alpha));}
  function cube(x,y,z,w,h,d,col=white){
    const a=x-w/2,b=x+w/2,c=y-h/2,e=y+h/2,f=z-d/2,g=z+d/2;
    quad([a,e,f],[b,e,f],[b,e,g],[a,e,g],col,1);
    quad([a,c,g],[b,c,g],[b,e,g],[a,e,g],col,.92);
    quad([b,c,g],[b,c,f],[b,e,f],[b,e,g],col,.82);
    quad([a,c,f],[a,c,g],[a,e,g],[a,e,f],col,.90);
    quad([b,c,f],[a,c,f],[a,e,f],[b,e,f],col,.87);
  }
  function disc(x,z,r,col,alpha,y=.006){for(let i=0;i<40;i++){const a=i*Math.PI/20,b=(i+1)*Math.PI/20;point([x,y,z],col,1,alpha);point([x+Math.cos(a)*r,y,z+Math.sin(a)*r],col,1,alpha);point([x+Math.cos(b)*r,y,z+Math.sin(b)*r],col,1,alpha);}}
  function ring(x,z,r,width,col,alpha,y=.025){for(let i=0;i<48;i++){const a=i*Math.PI/24,b=(i+1)*Math.PI/24;quad([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x+Math.cos(b)*(r-width),y,z+Math.sin(b)*(r-width)],[x+Math.cos(a)*(r-width),y,z+Math.sin(a)*(r-width)],col,1,alpha);}}
  function shadow(x,z,r){for(let i=6;i>0;i--)disc(x,z,r+i*.035,[.61,.68,.83],.018,.004+i*.0005);}
  function route(x,z,w,d){cube(x,.022,z,w,.018,d,[.75,.80,.98]);cube(x,.033,z,w,.009,d*.32,[.44,.56,.92]);}
  function tower(x,z,w,h,d){
    const glass=[.63,.73,.84],champagne=[.83,.79,.71];
    shadow(x+.15,z+.14,w*.72);cube(x,h/2+.15,z,w,h,d,[.93,.95,.98]);
    cube(x,.13,z,w+.19,.18,d+.19,pearl);
    // Continuous glazing and slender structural framing replace chunky window blocks.
    cube(x,h/2+.20,z+d/2+.018,w*.90,h-.13,.027,glass);
    cube(x+w/2+.018,h/2+.20,z,.027,h-.13,d*.9,[.55,.66,.80]);
    const floors=Math.floor(h/.32);
    for(let i=0;i<floors;i++){
      const y=.38+i*.32;
      cube(x,y,z+d/2+.043,w*.94,.022,.039,white);
      cube(x+w/2+.04,y,z,.039,.022,d*.94,white);
      cube(x-w*.19,y+.1,z+d/2+.04,w*.25,.07,.012,[.72,.81,.89]);
      if(i%3===0){cube(x,y-.025,z+d/2+.105,w+.07,.035,.18,white);cube(x,y+.03,z+d/2+.185,w*.96,.085,.017,[.83,.88,.94]);}
    }
    [-.46,0,.46].forEach(f=>cube(x+w*f,h/2+.16,z+d/2+.049,.026,h+.035,.045,f===0?champagne:white));
    cube(x+w/2+.055,h/2+.16,z-d*.43,.045,h+.035,.026,white);
    // Stepped crown, roof terrace, and discreet planted planters.
    cube(x,h+.20,z,w+.13,.07,d+.12,white);cube(x-.07,h+.28,z-.07,w*.70,.14,d*.68,white);
    cube(x+.12,h+.35,z+.1,w*.38,.05,d*.3,[.70,.80,.75]);
    for(let i=0;i<4;i++)cube(x-w*.28+i*w*.19,h+.45,z-d*.13,.025,.20,d*.56,champagne);
    cube(x,h+.55,z-d*.13,w*.78,.035,d*.60,white);
    cube(x,.25,z+d/2+.056,w*.25,.32,.035,[.46,.58,.75]);
  }
  function foliage(x,y,z,rx,ry,rz){
    const p=(a,b)=>[x+Math.sin(a)*Math.cos(b)*rx,y+Math.cos(a)*ry,z+Math.sin(a)*Math.sin(b)*rz];
    for(let i=0;i<8;i++)for(let j=0;j<12;j++){const a=i*Math.PI/8,b=(i+1)*Math.PI/8,c=j*Math.PI/6,d=(j+1)*Math.PI/6;quad(p(a,c),p(b,c),p(b,d),p(a,d),[.65,.77,.71],.84+.13*Math.cos(a)+.05*Math.sin(c));}
  }
  function tree(x,z){shadow(x,z,.23);cube(x,.27,z,.045,.45,.045,[.73,.77,.78]);foliage(x,.68,z,.23,.32,.23);foliage(x+.11,.77,z+.03,.17,.23,.17);
  }
  function packageAt(x,y,z,s=.2){cube(x,y,z,s,s,s,kraft);cube(x,y+s/2+.002,z,s*.16,.012,s+.007,[.97,.87,.69]);cube(x,y,z+s/2+.004,s*.17,s,.012,[.97,.87,.69]);cube(x+s*.24,y,z+s/2+.012,s*.23,s*.23,.014,white);}
  function van(x,z){shadow(x,z,.55);cube(x,.35,z,1.02,.39,.47,white);cube(x-.19,.62,z,.63,.18,.45,white);cube(x+.37,.51,z,.23,.25,.45,white);cube(x+.365,.57,z+.245,.18,.15,.014,windowBlue);cube(x-.20,.33,z+.245,.59,.12,.014,blue);cube(x-.20,.33,z-.245,.59,.12,.014,blue);cube(x+.505,.41,z,.03,.12,.34,windowBlue);[-.34,.32].forEach(dx=>[-.24,.24].forEach(dz=>{cube(x+dx,.17,z+dz,.16,.20,.085,[.32,.38,.50]);cube(x+dx,.17,z+dz*1.12,.075,.08,.012,pearl);}));}
  function render(){if(!valid)return;vertices=[];translucent=[];
    // Soft floating site plate and subtly illuminated physical delivery routes.
    cube(0,-.13,0,5.7,.20,3.55,[.91,.935,.99]);cube(0,-.021,0,5.64,.035,3.49,white);
    cube(0,.001,1.12,5.3,.02,.52,[.86,.89,.95]);
    for(let x=-2.45;x<2.5;x+=.4)cube(x,.018,1.13,.21,.012,.018,white);
    route(.8,.57,.11,1.25);route(-.35,-.04,2.4,.11);route(-1.35,-.38,.11,.73);
    for(let i=0;i<3;i++)ring(.78,.6,.27+i*.2+time*.075% .2,.014,[.43,.55,.98],.40-i*.08);
    tower(-1.22,-.89,.82,2.64,.87);tower(-.12,-1.21,.75,2.10,.78);
    // Shared arrival podium, landscaped pool court, and glazed concierge pavilion.
    cube(-.72,.11,-.6,2.2,.13,1.8,[.91,.93,.96]);
    cube(1.95,.035,-1.05,1.26,.07,.83,pearl);cube(1.95,.083,-1.05,1.09,.025,.66,[.69,.84,.88]);
    for(let i=0;i<3;i++)cube(1.95,.10,-1.28+i*.16,.78,.012,.012,[.83,.92,.95]);
    [-1.92,-.82].forEach(x=>{cube(x,.09,.26,.54,.12,.25,[.85,.89,.89]);cube(x,.16,.26,.46,.035,.18,[.65,.78,.7]);});
    shadow(1.2,-.08,.7);cube(1.13,.42,-.13,1.25,.77,.96,white);cube(1.13,.85,-.13,1.43,.09,1.15,white);
    cube(1.13,.45,.365,1.05,.64,.028,[.61,.73,.84]);
    for(let i=0;i<5;i++)cube(.64+i*.245,.43,.392,.023,.70,.034,[.82,.79,.72]);
    cube(1.13,.77,.397,1.05,.035,.04,[.84,.81,.72]);cube(1.13,.14,.397,1.05,.025,.04,[.84,.81,.72]);
    cube(1.13,.9,-.27,.95,.025,.47,[.69,.79,.72]);
    cube(.52,.14,.44,.56,.22,.52,pearl);packageAt(.45,.35,.45,.21);packageAt(.7,.32,.55,.17);
    cube(-.71,.37,-.02,.9,.09,.53,white);cube(-1.1,.19,.17,.05,.37,.06,pearl);cube(-.31,.19,.17,.05,.37,.06,pearl);
    tree(-2.25,.23);tree(2.45,-.38);tree(2.26,.3);tree(-2.15,-1.33);
    // The courier decelerates at the lobby; the new parcel arcs toward the counter.
    const v=-2.25+ease(time/1.45)*2.0;van(v,1.15);
    const p=ease((time-1.1)/1.25);packageAt(v+(1.13-v)*p,.65+Math.sin(p*Math.PI)*.72,.99-(.45*p),.23);
    const signal=ease((time-1.6)/.9);cube(-1.22,1.91,-.427,.63,.14,.025,[.68-signal*.18,.77-signal*.12,.91]);
    const trail=(time*.6)%1;cube(.8,.06,.88-trail*.87,.09,.025,.09,[.30,.46,.94]);

    const ratio = canvas.width / canvas.height;
    uniforms.uAspect.value = ratio;
    uniforms.uSize.value = Math.max(2.6, 3.4 / ratio);
    uniforms.uAngle.value = .10 + Math.sin(time * .38) * .075;
    [vertices, translucent].forEach((values, index) => {
      const { data, geometry } = batches[index];
      data.array.set(values);
      data.clearUpdateRanges();
      data.addUpdateRange(0, values.length);
      data.needsUpdate = true;
      geometry.setDrawRange(0, values.length / 7);
    });
    renderer.render(scene, camera);
  }
  function tick(now) { if (!running) return; if (last) time += Math.min((now - last) / 1000, .1); last = now; render(); frame = requestAnimationFrame(tick); }
  function pause() { running = false; cancelAnimationFrame(frame); last = 0; }
  function play() { if (running || !valid) return; running = true; last = 0; frame = requestAnimationFrame(tick); }
  function reset(still = false) { pause(); time = still ? 2.8 : 0; render(); }
  const resize = new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    render();
  });
  resize.observe(canvas);
  const onContextLost = () => { valid = false; pause(); canvas.hidden = true; fallback.style.display = "flex"; };
  canvas.addEventListener("webglcontextlost", onContextLost);
  reset();
  return { reset, pause, play, dispose() {
    valid = false;
    pause();
    resize.disconnect();
    canvas.removeEventListener("webglcontextlost", onContextLost);
    batches.forEach(({ geometry }) => geometry.dispose());
    materials.forEach(material => material.dispose());
    renderer.dispose();
  } };
}

