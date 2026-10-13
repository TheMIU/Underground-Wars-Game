'use strict';

// A fixed, symmetric 3D diorama. Game coordinates remain the source of truth.
// Pointer positions are raycast back onto the saw plane, even after resizing.
class SiegeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.OrthographicCamera(-6.9, 6.9, 4.15, -4.15, .1, 80);
    this.camera.position.set(0, 2.7, 24);
    this.camera.lookAt(0, .32, 0);
    this.raycaster = new THREE.Raycaster();
    this.sawPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -.4);
    this.materials = new Map();
    this.itemMeshes = new Map();
    this.shotMeshes = new Map();
    this.unitMeshes = new Map();
    this.lastItems = null;
    this.lastHP = [100, 100];
    this.damageEffects = [];
    this.sides = [0xff665b, 0x4dbff4];
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.buildLighting();
    this.buildBackdrop();
    this.buildGround();
    this.castles = [this.buildCastle(-4.8, 0), this.buildCastle(4.8, 1)];
    this.bases = [this.buildBase(-4.85, 0), this.buildBase(4.85, 1)];
    this.sawMesh = this.buildSaw();
    this.setShadows(this.sawMesh, false);
    this.world.add(this.sawMesh);
    this.buildSawDestruction();
    this.buildTrail();
    this.buildParticles();
    this.resize();
    this.renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      document.getElementById('toast').textContent = 'Graphics paused · reload to resume';
    });
  }

  material(color, metalness = 0, roughness = .75, emissive = 0) {
    const key = `${color}/${metalness}/${roughness}/${emissive}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity: emissive ? .35 : 0, flatShading: true }));
    return this.materials.get(key);
  }

  mesh(geometry, material, parent, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    parent.add(m);
    return m;
  }

  box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), this.material(color), parent, x, y, z);
  }

  buildLighting() {
    this.scene.add(new THREE.HemisphereLight(0xd5edff, 0x80613d, 1.65));
    const sun = new THREE.DirectionalLight(0xffe5bd, 2.7);
    sun.position.set(-4, 9, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 7, bottom: -5, near: .1, far: 35 });
    sun.shadow.bias = -.0006;
    sun.shadow.normalBias = .035;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x94c9ff, 1);
    fill.position.set(6, 1, 8);
    this.scene.add(fill);
  }

  buildBackdrop() {
    const sky = document.createElement('canvas');
    sky.width = 4; sky.height = 256;
    const c = sky.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#64aec5'); g.addColorStop(.55, '#b4d9d4'); g.addColorStop(1, '#ecedc9');
    c.fillStyle = g; c.fillRect(0, 0, 4, 256);
    const texture = new THREE.CanvasTexture(sky); texture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = texture;
    const sun = this.mesh(new THREE.SphereGeometry(.48, 20, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c9 }), this.world, 1.9, 3.1, -7, false);
    const halo = this.mesh(new THREE.CircleGeometry(.72, 32), new THREE.MeshBasicMaterial({ color: 0xfff4d9, transparent: true, opacity: .14, depthWrite: false }), this.world, sun.position.x, sun.position.y, -7.2, false);
    halo.scale.y = 1.05;
    this.clouds = [];
    for (const [x, y, scale] of [[-4.6, 3.2, .75], [-.8, 3.45, .52], [4.6, 2.9, .64]]) {
      const cloud = new THREE.Group(); cloud.position.set(x, y, -6);
      for (let j = 0; j < 4; j++) {
        const p = this.mesh(new THREE.SphereGeometry(.29, 12, 8), this.material(0xe5f2ec), cloud, j * .28 - .42, Math.sin(j * 2) * .05, 0, false);
        p.scale.set(1.35, .72 + (j % 2) * .3, .65);
      }
      cloud.scale.setScalar(scale); this.clouds.push(cloud); this.world.add(cloud);
    }
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 11; i++) {
        const x = -8 + i * 1.6, radius = 1.3 + ((i * 17) % 5) * .16;
        const m = this.mesh(new THREE.ConeGeometry(radius, 1.2 + (i % 3) * .4, 5), this.material(row ? 0x8caf9d : 0xaac8b5), this.world, x, .98, -4.7 + row * 1.3, false);
        m.rotation.y = i * .7;
      }
    }
    // A quiet valley separates the two castles. All foreground props are mirrored.
    for (const sign of [-1, 1]) {
      for (const [x, size] of [[3.55, .55], [5.85, .72], [2.75, .33]]) {
        const tree = new THREE.Group(); tree.position.set(sign * x, 1.15, -.65);
        this.box(tree, .1, .45, .1, 0x786b50, 0, .18);
        this.mesh(new THREE.ConeGeometry(size * .32, size, 7), this.material(0x4f8060), tree, 0, .53, 0);
        this.mesh(new THREE.ConeGeometry(size * .27, size * .7, 7), this.material(0x68936b), tree, 0, .72, 0);
        this.world.add(tree);
      }
    }
  }

  buildGround() {
    this.soilCanvas = document.createElement('canvas');
    this.soilCanvas.width = 1200; this.soilCanvas.height = 450;
    const c = this.soilCanvas.getContext('2d');
    c.fillStyle = '#a77c58'; c.fillRect(0, 0, 1200, 450);
    for (let layer = 0; layer < 4; layer++) {
      c.fillStyle = ['#b88c61', '#a47753', '#8f6349', '#79533f'][layer];
      c.beginPath(); c.moveTo(0, layer * 112);
      for (let x = 0; x <= 1200; x += 30) c.lineTo(x, layer * 112 + Math.sin(Math.min(x,1200-x) * .008 + layer) * 12);
      c.lineTo(1200, 450); c.lineTo(0, 450); c.fill();
    }
    // Mirrored strata and stones keep the resource map equally legible on both sides.
    for (let i = 0; i < 480; i++) {
      const x = (i * 83 + 17) % 600, y = (i * 71 + 29) % 450;
      for (const px of [x, 1200 - x]) {
        c.fillStyle = i % 3 ? '#ffffff0c' : '#37282422';
        c.beginPath(); c.ellipse(px, y, 1.5 + i % 4, 1 + i % 2, i, 0, Math.PI * 2); c.fill();
      }
    }
    const soil = new THREE.CanvasTexture(this.soilCanvas); soil.colorSpace = THREE.SRGBColorSpace;
    // Extend the cutaway beyond the viewport without stretching the arena texture.
    // Clamped mask edges stay solid outside the playable excavation area.
    soil.wrapS=THREE.RepeatWrapping;
    soil.repeat.set(120/12,80/4.5);soil.offset.set((1-120/12)/2,1-80/4.5);
    this.maskCanvas = document.createElement('canvas'); this.maskCanvas.width = 1200; this.maskCanvas.height = 450;
    this.mask = this.maskCanvas.getContext('2d'); this.clearMask();
    this.maskTexture = new THREE.CanvasTexture(this.maskCanvas);
    this.maskTexture.repeat.copy(soil.repeat);this.maskTexture.offset.copy(soil.offset);
    const front = new THREE.MeshStandardMaterial({ map: soil, alphaMap: this.maskTexture, alphaTest: .48, roughness: 1 });
    this.mesh(new THREE.PlaneGeometry(120, 80), front, this.world, 0, 1.15-40, 0, false);
    // A real recessed backing is visible through the excavated front surface.
    this.box(this.world, 120, 80, .75, 0x342b30, 0, 1.15-40, -.75);
    this.box(this.world, 120, .14, 1.7, 0x5e8650, 0, 1.17, -.67);
    this.box(this.world, 120, .065, 1.78, 0xa5c875, 0, 1.25, -.63);
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 14; i++) {
        this.box(this.world, .09, .035, .11, i % 2 ? 0x7fa660 : 0xbedb8d, sign * (.4 + i * .39), 1.31, -.12 - (i % 3) * .4);
      }
    }
  }

  clearMask() {
    this.mask.fillStyle = '#fff'; this.mask.fillRect(0, 0, 1200, 450);
    this.mask.strokeStyle = '#000'; this.mask.lineWidth = 34; this.mask.lineCap = 'round'; this.mask.lineJoin = 'round';
    this.stampedPaths = new WeakMap();
    if (this.maskTexture) this.maskTexture.needsUpdate = true;
  }

  buildCastle(x, side) {
    const castle = new THREE.Group(); castle.position.set(x, 1.28, -.38);castle.scale.setScalar(.8);
    const team = this.sides[side], stone = side ? 0xcbd9d9 : 0xe7dcca;
    this.box(castle, 1.74, .15, 1.12, 0x6a7e72, 0, .03, -.06);
    this.box(castle, 1.18, .83, .7, stone, 0, .48, 0);
    this.box(castle, 1.25, .10, .75, 0xf6eed8, 0, .86, .015);
    this.box(castle, 1.2, .12, .78, 0xabb6a5, 0, .15, .02);
    // Individual bevel-free masonry courses keep the chunky toy aesthetic.
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const bx = -.5 + col * .25 + (row % 2 ? .07 : 0);
        if (Math.abs(bx) > .3 || row > 2) this.box(castle, .235, .012, .015, 0x9caaa0, bx, .22 + row * .17, .359);
      }
    }
    // Extruded arch gate.
    const arch = new THREE.Shape(); arch.moveTo(-.17, 0); arch.lineTo(.17, 0); arch.lineTo(.17, .31); arch.absarc(0, .31, .17, 0, Math.PI, false); arch.closePath();
    this.mesh(new THREE.ExtrudeGeometry(arch, { depth: .025, bevelEnabled: true, bevelSize: .02, bevelThickness: .02, bevelSegments: 1, steps: 1 }), this.material(0x2d4145), castle, 0, .12, .37);
    for (const bx of [-.1, 0, .1]) this.box(castle, .025, .35, .018, 0x8a7150, bx, .30, .42);
    this.box(castle, .35, .025, .02, 0xbdab7b, 0, .23, .44);
    this.box(castle, .35, .025, .02, 0xbdab7b, 0, .39, .44);
    for (const sign of [-1, 1]) {
      const tower = new THREE.Group(); tower.position.set(sign * .65, 0, .04);
      this.mesh(new THREE.CylinderGeometry(.255, .29, 1.06, 8), this.material(stone), tower, 0, .58);
      this.mesh(new THREE.CylinderGeometry(.3, .3, .10, 8), this.material(0xf4e9d1), tower, 0, 1.12);
      this.mesh(new THREE.CylinderGeometry(.3, .3, .08, 8), this.material(team), tower, 0, .24);
      this.mesh(new THREE.ConeGeometry(.36, .39, 8), this.material(team, .08, .5), tower, 0, 1.38);
      this.mesh(new THREE.SphereGeometry(.045, 8, 6), this.material(0xffdb7a, .35), tower, 0, 1.60);
      this.box(tower, .105, .21, .02, 0x2d4145, 0, .73, .264);
      this.box(tower, .14, .025, .035, 0xffedc7, 0, .63, .28);
      castle.add(tower);
    }
    for (let i = 0; i < 6; i++) this.box(castle, .12, .17, .22, stone, -.5 + i * .2, 1.00, -.17);
    const keep = this.box(castle, .48, .59, .48, stone, 0, 1.15, -.12);
    this.mesh(new THREE.ConeGeometry(.41, .38, 4), this.material(team, .05, .6), castle, 0, 1.63, -.12).rotation.y = Math.PI / 4;
    this.box(castle, .12, .19, .025, 0x33464b, 0, 1.2, .13);
    this.box(castle, .028, .62, .028, 0xdcd6bc, 0, 1.99, -.12);
    const flag = this.box(castle, .39, .20, .022, team, .21, 2.17, -.12);
    this.box(castle, .07, .09, .027, 0xffedc7, .18, 2.17, -.098);
    const banner = this.box(castle, .18, .36, .04, team, -.39, .58, .4);
    this.box(castle, .045, .12, .045, 0xffedc7, -.39, .60, .43);
    const cracks = new THREE.Group(); cracks.visible = false;
    const points = [[.35,.68,.39],[.25,.53,.40],[.37,.43,.40],[.28,.29,.40]].map(p=>new THREE.Vector3(...p));
    cracks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color:0x475051})));
    castle.add(cracks);
    this.world.add(castle);
    return { group: castle, flag, banner, keep, cracks, hit: 0 };
  }

  buildBase(x, side) {
    const group = new THREE.Group(); group.position.set(x, 1.03, .42);
    this.box(group, .71, .25, .24, 0x344955, 0, 0, -.1);
    this.box(group, .74, .08, .28, 0xc4d1c7, 0, .16, -.1);
    for (const sign of [-1, 1]) this.box(group, .07, .31, .15, this.sides[side], sign * .32, .01, .04);
    this.mesh(new THREE.TorusGeometry(.25,.038,8,64),new THREE.MeshBasicMaterial({color:0x42535b}),group,0,-.005,.025,false);
    const fuelUniform={value:100/140};
    const ringMaterial=new THREE.MeshBasicMaterial({color:this.sides[side],transparent:true});
    ringMaterial.onBeforeCompile=shader=>{
      shader.uniforms.uFuel=fuelUniform;
      shader.vertexShader='varying vec2 vGaugePosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGaugePosition=position.xy;');
      shader.fragmentShader='uniform float uFuel;\nvarying vec2 vGaugePosition;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat gaugeAngle=mod(atan(vGaugePosition.x,vGaugePosition.y)+6.2831853,6.2831853)/6.2831853;\nif(gaugeAngle>uFuel)discard;');
    };
    ringMaterial.customProgramCacheKey=()=> 'base-fuel-gauge-v1';
    const ring = this.mesh(new THREE.TorusGeometry(.25,.035,8,64),ringMaterial,group,0,-.005,.045,false);
    const label=document.createElement('div');label.className=`base-fuel-label ${side?'blue':'red'}`;
    label.setAttribute('role','progressbar');label.setAttribute('aria-label',`${side?'Blue':'Red'} saw fuel percentage`);label.setAttribute('aria-valuemin','0');label.setAttribute('aria-valuemax','100');
    label.innerHTML='<span aria-hidden="true">ϟ</span><b>71%</b>';
    document.getElementById('base-gauges').append(label);
    this.box(group, .15, .045, .11, 0xffe4a1, 0, .16, .07);
    this.setShadows(group,false);this.world.add(group); return { group, ring, fuelUniform, label, value:label.querySelector('b') };
  }

  buildMissile(color = 0xffedb7) {
    const group = new THREE.Group();
    this.mesh(new THREE.CylinderGeometry(.095, .105, .28, 12), this.material(color, .25, .35), group, 0, -.005);
    this.mesh(new THREE.ConeGeometry(.098, .17, 12), this.material(0xe78866, .15, .5), group, 0, .215);
    this.mesh(new THREE.CylinderGeometry(.11, .11, .055, 12), this.material(0x465d67, .5, .3), group, 0, -.02);
    this.mesh(new THREE.CylinderGeometry(.065, .07, .08, 10), this.material(0x344850, .6, .35), group, 0, -.19);
    for (let i = 0; i < 3; i++) {
      const fin = this.box(group, .055, .14, .12, 0xda8060, 0, -.11, .12);
      fin.position.x = Math.sin(i * Math.PI * 2 / 3) * .12;
      fin.position.z = Math.cos(i * Math.PI * 2 / 3) * .12;
      fin.rotation.y = i * Math.PI * 2 / 3;
      fin.rotation.z = i === 0 ? -.15 : .15;
    }
    const light = this.mesh(new THREE.SphereGeometry(.027, 8, 6), this.material(0xffecaf, .1, .4, 0xffc75a), group, 0, .07, .09);
    group.userData.light = light;
    const exhaust = this.mesh(new THREE.ConeGeometry(.07, .29, 8), new THREE.MeshBasicMaterial({color:0xffc566}), group, 0, -.35, 0, false);
    exhaust.rotation.z = Math.PI; exhaust.visible = false; group.userData.exhaust = exhaust;
    return group;
  }

  buildFuel() {
    const group = new THREE.Group();
    this.box(group, .27, .32, .18, 0xa6d971, 0, 0, 0);
    this.box(group, .23, .28, .03, 0xb9eb88, 0, 0, .11);
    this.box(group, .09, .06, .11, 0x445a46, .055, .19, 0);
    const handle = this.mesh(new THREE.TorusGeometry(.065, .017, 6, 12, Math.PI), this.material(0xb9eb88), group, -.05, .17, 0);
    handle.rotation.z = 0;
    const bolt = new THREE.Shape(); bolt.moveTo(.015,.10);bolt.lineTo(-.07,-.01);bolt.lineTo(-.005,-.01);bolt.lineTo(-.015,-.105);bolt.lineTo(.07,.01);bolt.lineTo(.01,.01);bolt.closePath();
    this.mesh(new THREE.ExtrudeGeometry(bolt,{depth:.005,bevelEnabled:false}), this.material(0x42653c), group, 0, 0, .13);
    return group;
  }

  buildUnit(side = -1) {
    const group = new THREE.Group(), team = side < 0 ? 0xa697ca : this.sides[side];
    const body = this.box(group,.22,.23,.16,team,0,-.02,0);
    this.box(group,.14,.055,.025,0xe9e3ce,0,-.015,.09);
    this.mesh(new THREE.SphereGeometry(.10,12,8),this.material(0xe6d9b1),group,0,.16,.015);
    this.mesh(new THREE.SphereGeometry(.14,12,8,0,Math.PI*2,0,Math.PI/2),this.material(side<0?0xe4bd65:team,.1,.6),group,0,.18,.015);
    this.mesh(new THREE.CylinderGeometry(.155,.155,.025,12),this.material(side<0?0xf2d486:team),group,0,.18,.015);
    for(const x of [-.036,.036])this.mesh(new THREE.SphereGeometry(.014,6,5),this.material(0x354a54),group,x,.15,.103);
    this.mesh(new THREE.SphereGeometry(.032,8,6),this.material(0xffe7a1,.15,.35,0xffcf6b),group,0,.235,.129);
    const legs=[];
    for(const x of [-.062,.062]){
      const leg=new THREE.Group();leg.position.set(x,-.13,0);
      this.box(leg,.062,.10,.075,0x394d60,0,-.025,0);
      this.box(leg,.084,.05,.14,0x2b3d4a,0,-.09,.025);
      group.add(leg);legs.push(leg);
    }
    const arms=[];
    for(const sign of [-1,1]){
      const arm=new THREE.Group();arm.position.set(sign*.135,.06,0);
      this.box(arm,.064,.17,.09,team,0,-.08,0);
      this.mesh(new THREE.SphereGeometry(.045,8,6),this.material(0xe7d8ab),arm,0,-.16,.01);
      group.add(arm);arms.push(arm);
    }
    const tool=new THREE.Group();tool.position.set(.02,-.17,.025);
    this.box(tool,.025,.22,.025,0x9b7953,0,.02,0);
    this.box(tool,.19,.045,.055,0xc8d4d5,0,.13,0);
    this.mesh(new THREE.ConeGeometry(.045,.09,4),this.material(0xb2c4c8,.5,.4),tool,.125,.13,0).rotation.z=-Math.PI/2;
    arms[1].add(tool);
    group.userData={body,legs,arms,side};
    if(side===1)group.scale.x=-1;
    return group;
  }

  buildSaw() {
    const group = new THREE.Group(), blade = new THREE.Group();
    const shape = new THREE.Shape();
    for (let i = 0; i < 48; i++) {
      const angle = i / 48 * Math.PI * 2, r = i % 3 === 0 ? .225 : .172;
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      if (!i) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    this.mesh(new THREE.ExtrudeGeometry(shape, {depth:.055,bevelEnabled:true,bevelSize:.007,bevelThickness:.006,bevelSegments:1}), this.material(0xdce6e5,.65,.25), blade,0,0,-.02);
    const rim = this.mesh(new THREE.TorusGeometry(.125,.009,6,24),this.material(0x758b94,.7,.25),blade,0,0,.047);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;this.mesh(new THREE.CircleGeometry(.022,8),this.material(0x334955),blade,Math.cos(a)*.115,Math.sin(a)*.115,.049,false)}
    group.add(blade);group.userData.blade=blade;
    const hub=this.mesh(new THREE.CylinderGeometry(.078,.078,.095,16),this.material(this.sides[0],.3,.3),group,0,0,.07);
    hub.rotation.x=Math.PI/2;group.userData.hub=hub;
    this.mesh(new THREE.SphereGeometry(.037,10,8),this.material(0xffeac2,.55,.2),group,0,0,.14);
    const arrow=this.mesh(new THREE.ConeGeometry(.047,.12,3),this.material(0xffd99c,0,.6,0xffb86c),group,0,-.34,.0,false);
    group.userData.arrow=arrow;group.visible=false;return group;
  }

  buildTrail() {
    const positions = new Float32Array(12000);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0,0);
    this.trail = new THREE.Line(geometry,new THREE.LineBasicMaterial({color:this.sides[0],transparent:true,opacity:.9}));
    this.trail.frustumCulled=false;this.world.add(this.trail);
    const arrow = new THREE.Group();this.readyMarker=arrow;
    this.mesh(new THREE.ConeGeometry(.075,.16,3),this.material(0xffefc6,0,.6,0xffdc88),arrow,0,0,0,false).rotation.z=Math.PI;
    this.world.add(arrow);
  }

  buildSawDestruction() {
    const group = new THREE.Group();
    const fragments = [];
    for (let quadrant = 0; quadrant < 4; quadrant++) {
      const shape = new THREE.Shape();
      for (let i = 0; i <= 12; i++) {
        const a = (quadrant * 12 + i) / 48 * Math.PI * 2;
        const r = i % 3 === 0 ? .225 : .172;
        if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      for (let i = 12; i >= 0; i--) {
        const a = (quadrant * 12 + i) / 48 * Math.PI * 2;
        shape.lineTo(Math.cos(a) * .065, Math.sin(a) * .065);
      }
      shape.closePath();
      const piece = this.mesh(new THREE.ExtrudeGeometry(shape, { depth: .055, bevelEnabled: true, bevelSize: .006, bevelThickness: .006, bevelSegments: 1 }), this.material(0xdce6e5,.65,.25), group, 0,0,0,false);
      fragments.push(piece);
    }
    const hub = this.mesh(new THREE.CylinderGeometry(.078,.078,.095,16),this.material(this.sides[0],.3,.3),group,0,0,.08,false);
    const flash = this.mesh(new THREE.SphereGeometry(.18,12,8),new THREE.MeshBasicMaterial({color:0xfff0c4,transparent:true,opacity:1,depthWrite:false}),group,0,0,.1,false);
    const ring = this.mesh(new THREE.TorusGeometry(.22,.014,6,32),new THREE.MeshBasicMaterial({color:0xffc778,transparent:true,opacity:1,depthWrite:false}),group,0,0,.13,false);
    group.visible=false;this.world.add(group);this.sawDestruction={group,fragments,hub,flash,ring};
  }

  renderSawDestruction(saw,clock) {
    const effect=this.sawDestruction;
    const age=saw&&saw.destroyedAt!==undefined?clock-saw.destroyedAt:Infinity;
    effect.group.visible=age>=0&&age<1.05;
    if(!effect.group.visible)return;
    effect.group.position.copy(this.point(saw.x,saw.y,.56));
    const angle=saw.destroyedAngle;
    effect.fragments.forEach((piece,i)=>{
      const a=angle+(i+.5)*Math.PI/2;
      piece.position.set(Math.cos(a)*age*1.1,Math.sin(a)*age*1.1-age*age*.8,Math.sin(i*2)*age*.25);
      piece.rotation.set(age*(i%2?3:-3),age*(i%2?-2:2),angle+age*(i%2?8:-8));
      piece.scale.setScalar(Math.min(1,(1.05-age)*3));
    });
    effect.hub.material=this.material(this.sides[saw.destroyedSide],.3,.3);
    effect.hub.position.set(-age*.45,age*.7-age*age*1.2,.08+age*.2);
    effect.hub.rotation.set(Math.PI/2+age*7,age*4,age*5);
    effect.hub.scale.setScalar(Math.min(1,(1.05-age)*3));
    effect.flash.visible=age<.17;effect.flash.scale.setScalar(1+age*5);effect.flash.material.opacity=Math.max(0,1-age/.17);
    effect.ring.scale.setScalar(1+age*3.2);effect.ring.material.opacity=Math.max(0,1-age/.55);
  }

  buildParticles() {
    this.particleMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.028,0),new THREE.MeshBasicMaterial({color:0xffffff}),320);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.particleMesh.frustumCulled=false;this.particleMesh.count=0;this.world.add(this.particleMesh);
    this.dummy=new THREE.Object3D();this.tint=new THREE.Color();
  }

  point(x,y,z=.4){return new THREE.Vector3((x-600)/100,(360-y)/100,z)}

  screenToGame(clientX,clientY){
    const r=this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),this.camera);
    const p=new THREE.Vector3();if(!this.raycaster.ray.intersectPlane(this.sawPlane,p))return{x:600,y:360};
    return{x:p.x*100+600,y:360-p.y*100};
  }

  resize(){
    const w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    if(w===this.width&&h===this.height)return;this.width=w;this.height=h;
    this.renderer.setSize(w,h,false);
    const aspect=w/h,sceneAspect=13.8/8.3;
    const halfH=aspect<sceneAspect?6.9/aspect:4.15,halfW=halfH*aspect;
    Object.assign(this.camera,{left:-halfW,right:halfW,top:halfH,bottom:-halfH});this.camera.updateProjectionMatrix();
  }

  rebuildItems(items){
    for(const mesh of this.itemMeshes.values()){this.world.remove(mesh);this.disposeGeometry(mesh)}
    for(const mesh of this.shotMeshes.values()){this.world.remove(mesh);this.disposeGeometry(mesh)}
    for(const mesh of this.unitMeshes.values()){this.world.remove(mesh);this.disposeGeometry(mesh)}
    this.itemMeshes.clear();this.shotMeshes.clear();this.unitMeshes.clear();this.clearMask();this.lastItems=items;this.lastHP=[100,100];
    for(const effect of this.damageEffects){effect.label.remove();this.world.remove(effect.ring);effect.ring.geometry.dispose();effect.ring.material.dispose()}
    this.damageEffects=[];
    for(const item of items){const mesh=item.type==='missile'?this.buildMissile():item.type==='unit'?this.buildUnit():this.buildFuel();this.setShadows(mesh,false);mesh.position.copy(this.point(item.x,item.y));this.world.add(mesh);this.itemMeshes.set(item,mesh)}
  }

  disposeGeometry(group){group.traverse(m=>{if(m.geometry)m.geometry.dispose()})}
  setShadows(group,enabled){group.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=enabled;mesh.receiveShadow=enabled}})}

  stampPath(saw){
    if(!saw)return;
    const maskIndex=this.stampedPaths.get(saw.path)||0;
    if(saw.path.length<=maskIndex)return;
    const start=Math.max(0,maskIndex-1);this.mask.lineWidth=saw.phase?25:34;this.mask.beginPath();
    for(let i=start;i<saw.path.length;i++){const p=saw.path[i];if(i===start)this.mask.moveTo(p.x,p.y-245);else this.mask.lineTo(p.x,p.y-245)}
    this.mask.stroke();this.stampedPaths.set(saw.path,saw.path.length);this.maskTexture.needsUpdate=true;
  }

  damage(side,time,amount){
    this.castles[side].hit=time;
    const position=this.point(side?1080:120,175,.75);
    const ring=this.mesh(new THREE.TorusGeometry(.24,.025,6,32),new THREE.MeshBasicMaterial({color:0xffd888,transparent:true,opacity:1,depthWrite:false}),this.world,position.x,position.y,position.z,false);
    const label=document.createElement('span');label.className='damage-number';label.textContent=`−${amount}`;document.getElementById('effects').append(label);
    this.damageEffects.push({ring,label,time,position});
  }

  render(game){
    this.resize();const {items,saw,side,state,clock,hp,shots,units,particles,shake}=game;
    if(items!==this.lastItems)this.rebuildItems(items);
    this.stampPath(saw);
    for(const [item,mesh]of this.itemMeshes){mesh.visible=item.alive;if(item.alive){mesh.position.z=.4;mesh.rotation.z=item.type==='fuel'?.035*Math.sin(clock*2):0}}
    for(let s=0;s<2;s++){
      const castle=this.castles[s];castle.cracks.visible=hp[s]<100;
      if(hp[s]<this.lastHP[s])this.damage(s,clock,this.lastHP[s]-hp[s]);
      const hitAge=clock-castle.hit,hit=castle.hit>0&&hitAge<.45?Math.sin(hitAge*50)*(.45-hitAge)*.06:0;
      castle.group.rotation.z=hit;castle.flag.rotation.y=Math.sin(clock*3+s)*.13;
      castle.group.position.y=hp[s]===0?1.16:1.28;
      const active=s===side&&state!=='menu'&&state!=='end',base=this.bases[s];
      const fuel=active&&saw?Math.max(0,Math.min(140,saw.fuel)):100;
      base.fuelUniform.value=fuel/140;
      base.ring.material.opacity=active?(fuel<30?.6+.4*Math.sin(clock*9):1):.4;
      const percent=Math.round(fuel/140*100);base.value.textContent=percent+'%';base.label.classList.toggle('active',active);base.label.classList.toggle('low',active&&fuel<30);
      base.label.setAttribute('aria-valuenow',percent);base.label.title=`${side===s?'Active':'Next'} saw fuel: ${percent}% (${Math.ceil(fuel)} / 140)`;
      const labelPoint=new THREE.Vector3();base.group.getWorldPosition(labelPoint);labelPoint.x-=.72;labelPoint.z+=.08;labelPoint.project(this.camera);
      base.label.style.left=`${(labelPoint.x+1)*.5*this.width}px`;base.label.style.top=`${(-labelPoint.y+1)*.5*this.height}px`;
    }
    this.lastHP=[...hp];
    this.sawMesh.visible=!!saw&&(state==='dig'||state==='resolve'&&saw.returned||saw.destroyedAt!==undefined&&clock-saw.destroyedAt<.06);
    if(this.sawMesh.visible){
      this.sawMesh.position.copy(this.point(saw.x,saw.y));this.sawMesh.userData.blade.rotation.z=clock*18;
      this.sawMesh.userData.hub.material=this.material(this.sides[side],.3,.3);
      const arrow=this.sawMesh.userData.arrow;arrow.position.set(Math.cos(saw.angle)*.34,-Math.sin(saw.angle)*.34,.02);arrow.rotation.z=-saw.angle-Math.PI/2;
    }
    this.renderSawDestruction(saw,clock);
    const attribute=this.trail.geometry.attributes.position;let count=0;
    if(saw){const step=Math.max(1,Math.ceil(saw.path.length/3999));for(let i=0;i<saw.path.length;i+=step){const p=saw.path[i];attribute.setXYZ(count++,(p.x-600)/100,(360-p.y)/100,.04)}}
    attribute.needsUpdate=true;this.trail.geometry.setDrawRange(0,count);this.trail.material.color.setHex(this.sides[side]);this.trail.material.opacity=state==='resolve'?.55+.35*Math.sin(clock*8):.9;
    const activeShots=new Set(shots);
    for(const [shot,mesh]of this.shotMeshes)if(!activeShots.has(shot)){this.world.remove(mesh);this.disposeGeometry(mesh);this.shotMeshes.delete(shot)}
    for(const shot of shots){let mesh=this.shotMeshes.get(shot);if(!mesh){mesh=this.buildMissile(this.sides[shot.side]);this.world.add(mesh);this.shotMeshes.set(shot,mesh)}mesh.visible=shot.t>=0;if(!mesh.visible)continue;
      mesh.position.copy(this.point(shot.x,shot.y,.7));
      mesh.rotation.z=shot.angle||0;mesh.userData.exhaust.visible=true;mesh.userData.exhaust.scale.y=1+.3*Math.sin(clock*45);
    }
    for(const unit of units){
      this.stampPath(unit);
      let mesh=this.unitMeshes.get(unit);if(!mesh){mesh=this.buildUnit(unit.side);this.world.add(mesh);this.unitMeshes.set(unit,mesh)}
      mesh.visible=unit.phase!=='done';if(!mesh.visible)continue;
      mesh.position.copy(this.point(unit.x,unit.y,.42));
      this.setShadows(mesh,unit.phase!=='dig');
      mesh.userData.legs.forEach((leg,i)=>leg.rotation.z=unit.phase==='march'?Math.sin(clock*16+i*Math.PI)*.55:0);
      mesh.userData.arms.forEach((arm,i)=>arm.rotation.z=unit.phase==='dig'?Math.sin(clock*22+i)*.8:unit.phase==='attack'?Math.sin(unit.timer*15+i)*1.1:Math.sin(clock*16+i*Math.PI)*.3);
      if(unit.phase==='march')mesh.position.y+=Math.abs(Math.sin(clock*16))*.022;
    }
    this.particleMesh.count=Math.min(320,particles.length);
    for(let i=0;i<this.particleMesh.count;i++){const p=particles[i];this.dummy.position.copy(this.point(p.x,p.y,.55+Math.sin(i)*.15));this.dummy.rotation.set(clock+i,i,clock*2);this.dummy.scale.setScalar(Math.max(.1,Math.min(1,p.life*3)));this.dummy.updateMatrix();this.particleMesh.setMatrixAt(i,this.dummy.matrix);this.particleMesh.setColorAt(i,this.tint.set(p.color))}
    this.particleMesh.instanceMatrix.needsUpdate=true;if(this.particleMesh.instanceColor)this.particleMesh.instanceColor.needsUpdate=true;
    this.readyMarker.visible=state==='ready';this.readyMarker.position.set(side?4.85:-4.85,1.57+Math.sin(clock*5)*.035,.5);
    this.clouds.forEach((c,i)=>c.position.x+=Math.sin(clock*.3+i)*.00004);
    for(let i=this.damageEffects.length-1;i>=0;i--){const effect=this.damageEffects[i],age=clock-effect.time;if(age>1.2){effect.label.remove();this.world.remove(effect.ring);effect.ring.geometry.dispose();effect.ring.material.dispose();this.damageEffects.splice(i,1);continue}
      effect.ring.scale.setScalar(1+age*4);effect.ring.material.opacity=Math.max(0,1-age*1.5);
      const p=effect.position.clone();p.y+=age*.65;p.project(this.camera);
      effect.label.style.left=`${(p.x+1)*.5*this.width}px`;effect.label.style.top=`${(-p.y+1)*.5*this.height}px`;effect.label.style.opacity=Math.min(1,(1.2-age)*3);
    }
    this.camera.position.x=Math.sin(clock*90)*shake*.0018;this.camera.position.y=2.7+Math.cos(clock*80)*shake*.001;
    this.camera.lookAt(this.camera.position.x,.32+Math.cos(clock*80)*shake*.001,0);
    this.renderer.render(this.scene,this.camera);
  }
}
window.SiegeRenderer=SiegeRenderer;
