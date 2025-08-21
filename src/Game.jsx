import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/*
 Cubo Explorador
 - Player cube moves between three lanes: left, center, right.
 - Platforms (sections) are created ahead; old ones fade out and are removed.
 - Trees and small nature elements placed on sections.
 - Particles (Points) provide magical glow around player + ambient sparkles.
 - Mobile-friendly: pointer/swipe and on-screen buttons; keyboard support.
 - Lightweight: no heavy textures, low-poly meshes, instancing where useful.
*/

const LANES = [-3.0, 0, 3.0];
const SECTION_LENGTH = 28;
const VISIBLE_AHEAD = 5;
const BASE_SPEED = 3.6; // forward speed multiplier (exploration pace)
const SPEED_INCREASE = 0.0006; // small increase over time
const LANE_LERP = 0.16;

export default function Game(){
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const playerRef = useRef(null);
  const sectionsRef = useRef([]); // active sections
  const fadingRef = useRef([]); // sections fading out
  const instancedTreesRef = useRef([]);
  const animRef = useRef(null);
  const lastTimeRef = useRef(null);
  const distanceRef = useRef(0);
  const speedRef = useRef(BASE_SPEED);
  const targetLaneRef = useRef(1); // start center
  const [hudDist, setHudDist] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const touchStartRef = useRef(null);

  useEffect(() => {
    start();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function start(){
    const width = mountRef.current.clientWidth || window.innerWidth;
    const height = mountRef.current.clientHeight || window.innerHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x041426);
    scene.fog = new THREE.FogExp2(0x041426, 0.0038);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width/height, 0.1, 1000);
    camera.position.set(0, 5, -10);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.display = "block";
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights (cheap)
    const hemi = new THREE.HemisphereLight(0xbfeaf5, 0x081229, 0.85);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.25);
    dir.position.set(5, 20, -10);
    scene.add(dir);

    // Ground ambient plane (large, subtle)
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x072433 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI/2;
    ground.position.y = 0;
    scene.add(ground);

    // Player cube
    const cubeGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const cubeMat = new THREE.MeshStandardMaterial({ color: 0xffc86b, roughness: 0.6, metalness: 0.05 });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    cube.position.set(LANES[1], 1.0, 0);
    scene.add(cube);
    playerRef.current = { mesh: cube, bbox: new THREE.Box3() };

    // Particles: ambient sparkles (a few hundred points)
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);
    createAmbientParticles(particleGroup);

    // Create initial platforms ahead and slightly behind
    sectionsRef.current = [];
    fadingRef.current = [];
    distanceRef.current = 0;
    speedRef.current = BASE_SPEED;
    targetLaneRef.current = 1;
    lastTimeRef.current = performance.now();
    setHudDist(0);
    setShowModal(false);

    // Pre-generate sections
    let z = -SECTION_LENGTH; // start one behind so player is on first
    for(let i=0;i<VISIBLE_AHEAD+2;i++){
      spawnSection(z);
      z += SECTION_LENGTH;
    }

    // Event listeners
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive:true });
    renderer.domElement.addEventListener("touchend", onTouchEnd, { passive:true });

    // Start loop
    animRef.current = requestAnimationFrame(loop);
  }

  function cleanup(){
    cancelAnimationFrame(animRef.current);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKeyDown);
    if(rendererRef.current && rendererRef.current.domElement){
      rendererRef.current.domElement.removeEventListener("touchstart", onTouchStart);
      rendererRef.current.domElement.removeEventListener("touchend", onTouchEnd);
    }
    // dispose scene objects
    const scene = sceneRef.current;
    if(scene){
      scene.traverse(o => {
        if(o.geometry) o.geometry.dispose?.();
        if(o.material){
          if(Array.isArray(o.material)){
            o.material.forEach(m => m.dispose?.());
          } else {
            o.material.dispose?.();
          }
        }
      });
    }
    // remove canvas
    if(rendererRef.current && mountRef.current && rendererRef.current.domElement){
      mountRef.current.removeChild(rendererRef.current.domElement);
    }
    rendererRef.current = null;
    sceneRef.current = null;
    cameraRef.current = null;
    playerRef.current = null;
    sectionsRef.current = [];
    fadingRef.current = [];
  }

  function onResize(){
    const w = mountRef.current.clientWidth || window.innerWidth;
    const h = mountRef.current.clientHeight || window.innerHeight;
    const cam = cameraRef.current;
    const renderer = rendererRef.current;
    if(cam && renderer){
      cam.aspect = w/h; cam.updateProjectionMatrix();
      renderer.setSize(w,h);
    }
  }

  function onKeyDown(e){
    if(e.key === "ArrowLeft" || e.key === "a" || e.key === "A") moveLeft();
    if(e.key === "ArrowRight" || e.key === "d" || e.key === "D") moveRight();
    if(e.key === "r" || e.key === "R") restart();
  }

  function onTouchStart(e){
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: performance.now() };
  }
  function onTouchEnd(e){
    if(!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const dt = performance.now() - touchStartRef.current.time;
    if(dt < 500 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)){
      if(dx < 0) moveLeft(); else moveRight();
    } else {
      // tap: left/right halves
      const w = window.innerWidth;
      if(t.clientX < w*0.4) moveLeft();
      else if(t.clientX > w*0.6) moveRight();
    }
    touchStartRef.current = null;
  }

  function moveLeft(){ targetLaneRef.current = Math.max(0, targetLaneRef.current - 1); }
  function moveRight(){ targetLaneRef.current = Math.min(2, targetLaneRef.current + 1); }

  // Create platform section at zStart (zStart is the section's beginning)
  function spawnSection(zStart){
    const scene = sceneRef.current;
    if(!scene) return;

    // simple platform box
    const w = 12; const h = 0.4; const l = SECTION_LENGTH;
    const geom = new THREE.BoxGeometry(w, h, l);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c2d36, roughness: 0.9, transparent: true, opacity: 1.0 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, h/2, zStart + l/2);
    scene.add(mesh);

    // Add decorative instanced trees for this section (we will create a few trees with small geo)
    const trees = createTreesForSection(mesh.position.z, scene);

    const section = { mesh, mat, zStart, zEnd: zStart + l, trees, spawnedAt: performance.now() };
    sectionsRef.current.push(section);

    // Remove far-behind sections by moving to fadingRef
    if(sectionsRef.current.length > VISIBLE_AHEAD + 3){
      const old = sectionsRef.current.shift();
      if(old){
        fadingRef.current.push({ section: old, fade: 1.0 });
      }
    }
  }

  // create several trees around the given z position; returns array of tree objects
  function createTreesForSection(zCenter, scene){
    const trees = [];
    // we will create a handful of simple low-poly trees per section
    const num = 8 + Math.floor(Math.random() * 6);
    for(let i=0;i<num;i++){
      const laneIndex = Math.floor(Math.random() * LANES.length);
      const x = LANES[laneIndex] + (Math.random() - 0.5) * 1.8;
      const z = zCenter - SECTION_LENGTH/2 + Math.random() * SECTION_LENGTH;
      const scale = 0.7 + Math.random() * 1.1;
      const tree = buildTreeMesh(scale);
      tree.position.set(x, 0.3 * scale, z);
      scene.add(tree);
      trees.push(tree);
    }
    return trees;
  }

  // low-poly tree: trunk + cone leaves grouped
  function buildTreeMesh(scale=1){
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.12*scale, 0.14*scale, 0.9*scale, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b3f2b, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.45 * scale;
    group.add(trunk);

    const leavesGeo = new THREE.ConeGeometry(0.7*scale, 1.2*scale, 8);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x1ea35a, roughness: 0.8 });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 1.05 * scale;
    group.add(leaves);

    group.castShadow = false;
    group.receiveShadow = false;
    return group;
  }

  // create ambient sparkles + player halo
  function createAmbientParticles(parent){
    const count = 420;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const colorA = new THREE.Color(0x7be0ff);
    const colorB = new THREE.Color(0xff9fd8);

    for(let i=0;i<count;i++){
      const theta = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 120;
      const z = (Math.random() - 0.6) * 300;
      const x = Math.cos(theta) * r * (0.6 + Math.random() * 0.8);
      const y = 1.2 + Math.random() * 14;
      positions[i*3] = x;
      positions[i*3+1] = y;
      positions[i*3+2] = z;

      const c = colorA.clone().lerp(colorB, Math.random());
      colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
      sizes[i] = 8 + Math.random() * 18;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: {
        uTime: { value: 0.0 },
        pixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float uTime;
        uniform float pixelRatio;
        void main(){
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // small twinkle
          float pulse = 0.6 + 0.4 * sin(uTime * 2.0 + position.z * 0.01);
          gl_PointSize = size * pulse * pixelRatio * (150.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main(){
          float d = length(gl_PointCoord - vec2(0.5));
          float alpha = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `
    });

    const points = new THREE.Points(geom, mat);
    parent.add(points);
    // store reference to update uTime
    parent.userData.pointsMat = mat;
  }

  function loop(now){
    animRef.current = requestAnimationFrame(loop);
    const last = lastTimeRef.current || now;
    const dt = Math.min(0.05, (now - last) / 1000);
    lastTimeRef.current = now;

    // increase speed gently to convey exploration momentum
    speedRef.current += SPEED_INCREASE * dt * 1000;
    const speed = speedRef.current;

    // advance player's z position (exploration forward)
    const player = playerRef.current;
    player.mesh.position.z += speed * dt * 0.8; // forward pace

    // lateral lerp toward lane
    const targetX = LANES[targetLaneRef.current];
    player.mesh.position.x = THREE.MathUtils.lerp(player.mesh.position.x, targetX, LANE_LERP);

    // camera follow: slightly above & behind
    const cam = cameraRef.current;
    const desiredCam = new THREE.Vector3(player.mesh.position.x, player.mesh.position.y + 6.0, player.mesh.position.z - 10.5);
    cam.position.lerp(desiredCam, 0.12);
    cam.lookAt(player.mesh.position.x, player.mesh.position.y + 0.8, player.mesh.position.z + 6);

    // update ambient particles time uniform
    const scene = sceneRef.current;
    if(scene){
      scene.children.forEach(c => {
        if(c.type === 'Group' && c.userData.pointsMat){
          c.userData.pointsMat.uniforms.uTime.value = now * 0.001;
        }
      });
    }

    // spawn more sections when near last
    const lastSection = sectionsRef.current[sectionsRef.current.length - 1];
    if(lastSection && player.mesh.position.z > lastSection.zEnd - SECTION_LENGTH * 1.5){
      spawnSection(lastSection.zEnd);
    }

    // handle fading sections (opacity decreases)
    for(let i = fadingRef.current.length - 1; i >= 0; i--){
      const item = fadingRef.current[i];
      item.fade -= dt * 0.6; // fade speed
      const op = Math.max(0, item.fade);
      if(item.section.mat) item.section.mat.opacity = op;
      // fade trees in that section
      item.section.trees.forEach(t => {
        if(t.children){
          t.traverse(ch => { if(ch.material) { ch.material.transparent = true; ch.material.opacity = op; }});
        }
      });
      if(op <= 0){
        // remove meshes
        try{
          scene.remove(item.section.mesh);
          item.section.trees.forEach(t => scene.remove(t));
        }catch(e){}
        fadingRef.current.splice(i,1);
      }
    }

    // remove behind sections (start fading)
    while(sectionsRef.current.length && player.mesh.position.z - sectionsRef.current[0].zEnd > SECTION_LENGTH * 1.2){
      const old = sectionsRef.current.shift();
      if(old) fadingRef.current.push({ section: old, fade: 1.0 });
    }

    // update HUD (distance)
    distanceRef.current = Math.max(distanceRef.current, player.mesh.position.z);
    setHudDist(Math.floor(distanceRef.current));

    // lightweight collision: ensure player stays above ground (no gravity here)
    // Optional: if player falls below certain Y, show modal (not used currently)

    // render
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }

  function restart(){
    cleanup();
    start();
  }

  // UI overlay + controls
  return (
    <div ref={mountRef} style={{width:'100%',height:'100%',position:'relative'}}>
      <div className="hud" aria-hidden>
        <div className="badge">Distância: {hudDist}</div>
        <div className="badge">Vel: {Math.round(speedRef.current * 10)/10}</div>
      </div>

      <div className="top-right">
        <div className="info">Plataformas: {sectionsRef.current.length}</div>
      </div>

      <div className="controls" role="toolbar" aria-label="Controles do jogo">
        <div className="ctrl-btn" onPointerDown={() => moveLeft()}>⟵</div>
        <div className="ctrl-btn" onPointerDown={() => { targetLaneRef.current = 1; }}>CENTRO</div>
        <div className="ctrl-btn" onPointerDown={() => moveRight()}>⟶</div>
        <div className="ctrl-btn" onPointerDown={() => restart()}>RESTART</div>
      </div>

      {showModal && (
        <div className="modal-bg">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Reiniciar exploração?</h2>
            <p>Quer começar novamente e explorar novas paisagens?</p>
            <div className="actions">
              <button className="btn-primary" onClick={() => { setShowModal(false); restart(); }}>Sim — Reiniciar</button>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}