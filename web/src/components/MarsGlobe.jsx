import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  DEFAULT_CENTER, DEFAULT_DISTANCE, GLOBE_RADIUS, MIN_DISTANCE, MAX_DISTANCE,
  MAP_TRANSITION_DISTANCE, locationToVector, vectorToLocation,
  isSiteVisible, fieldOfView,
} from "../globe/globeMath.js";
import { fetchJson } from "../data/loadGrid.js";
import { studySiteFromMetadata } from "../globe/studySite.js";

export default function MarsGlobe({ viewport, onViewportChange, onEnterMap }) {
  const host = useRef(null);
  const markers = useRef(new Map());
  const focusSite = useRef(null);
  const sitePositions = useRef([]);
  const initialViewport = useRef(viewport);
  const callbacks = useRef({ onViewportChange, onEnterMap });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [sites, setSites] = useState([]);
  const [siteError, setSiteError] = useState("");

  useEffect(() => { callbacks.current = { onViewportChange, onEnterMap }; }, [onViewportChange, onEnterMap]);

  useEffect(() => {
    const element = host.current;
    let active = true, frame = 0, focus = null, transitioned = false, enteringStudyArea = false;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError("The Mars globe needs WebGL. Please enable hardware acceleration or use a supported browser.");
      setStatus("error");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "globe-canvas";
    renderer.domElement.setAttribute("aria-label", "Interactive Mars globe. Drag to rotate; pinch or scroll to zoom.");
    renderer.domElement.setAttribute("role", "img");
    element.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 30);
    const initial = initialViewport.current;
    const direction = locationToVector(initial?.center || DEFAULT_CENTER);
    camera.position.set(direction.x, direction.y, direction.z)
      .multiplyScalar(Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, initial?.distance || DEFAULT_DISTANCE)));
    camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;
    controls.minPolarAngle = 0.025;
    controls.maxPolarAngle = Math.PI - 0.025;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

    const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, 128, 96);
    const material = new THREE.MeshStandardMaterial({ color: 0xffb58a, roughness: 1, metalness: 0 });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.visible = false;
    scene.add(sphere);
    const sunlight = new THREE.DirectionalLight(0xffedce, 4);
    scene.add(sunlight, new THREE.AmbientLight(0xedd4c5, 0.12));

    const texture = new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}assets/mars.jpg`,
      (loaded) => {
        if (!active) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        material.map = loaded;
        material.needsUpdate = true;
        sphere.visible = true;
        setStatus("ready");
      },
      undefined,
      () => {
        if (active) {
          setStatus("error");
          setError("The Mars surface texture could not be loaded.");
        }
      },
    );
    fetchJson("jezero_grid_meta.json").then((meta) => {
      if (!active) return;
      const site = studySiteFromMetadata(meta);
      const point = locationToVector(site);
      sitePositions.current = [{ ...site, position: new THREE.Vector3(point.x, point.y, point.z) }];
      setSites([site]);
      setSiteError("");
    }).catch(() => {
      if (active) setSiteError("The Jezero study-area marker could not be loaded. Please reload and try again.");
    });
    let width = 1, height = 1;
    const resize = () => {
      width = Math.max(1, element.clientWidth);
      height = Math.max(1, element.clientHeight);
      const cssDiameter = parseFloat(getComputedStyle(element).getPropertyValue("--globe-diameter")) || 690;
      const diameter = Math.min(cssDiameter, width * 0.78, height * 0.68);
      camera.aspect = width / height;
      camera.fov = fieldOfView(height, diameter);
      // Keep the globe below the crown: its centre is at 60% of viewport height.
      camera.setViewOffset(width, height, 0, -height * 0.1, width, height);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    const currentViewport = () => ({
      center: vectorToLocation(camera.position),
      distance: camera.position.length(),
    });
    const publishViewport = () => callbacks.current.onViewportChange?.(currentViewport());
    const onControlStart = () => { focus = null; enteringStudyArea = false; };
    controls.addEventListener("start", onControlStart);
    controls.addEventListener("end", publishViewport);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    focusSite.current = (id) => {
      const site = sitePositions.current.find((item) => item.id === id);
      if (!site || transitioned || focus) return;
      // Flush any remaining damping before taking over camera movement.
      controls.enableDamping = false;
      controls.update();
      controls.enabled = false;
      const from = camera.position.clone().normalize();
      const to = site.position.clone().normalize();
      focus = {
        from,
        rotation: new THREE.Quaternion().setFromUnitVectors(from, to),
        distance: camera.position.length(),
        targetDistance: MAP_TRANSITION_DISTANCE - 0.03,
        start: performance.now(),
        duration: reducedMotion.matches ? 0 : 1200,
      };
      element.dataset.focusSite = site.id;
      element.dataset.focusing = "true";
    };

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3(), cameraDirection = new THREE.Vector3();
    const projected = new THREE.Vector3(), interpolation = new THREE.Quaternion();
    const animate = (time) => {
      if (!active) return;
      if (focus) {
        const t = focus.duration ? Math.min(1, (time - focus.start) / focus.duration) : 1;
        const ease = t * t * (3 - 2 * t);
        interpolation.identity().slerp(focus.rotation, ease);
        const distance = THREE.MathUtils.lerp(focus.distance, focus.targetDistance, ease);
        camera.position.copy(focus.from).applyQuaternion(interpolation).multiplyScalar(distance);
        camera.lookAt(0, 0, 0);
        if (t === 1) {
          focus = null;
          enteringStudyArea = true;
          controls.enabled = true;
          controls.enableDamping = true;
          controls.update();
          element.dataset.focusing = "false";
          publishViewport();
        }
      } else {
        controls.update();
      }
      camera.updateMatrixWorld();
      cameraDirection.copy(camera.position).normalize();
      right.crossVectors(up, cameraDirection).normalize();
      sunlight.position.copy(cameraDirection).multiplyScalar(1.8).addScaledVector(right, -3).addScaledVector(up, 2);
      renderer.render(scene, camera);

      for (const site of sitePositions.current) {
        const marker = markers.current.get(site.id);
        if (!marker) continue;
        projected.copy(site.position).project(camera);
        const visible = sphere.visible && isSiteVisible(site.position, camera.position) &&
          projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
        marker.hidden = !visible;
        if (visible) {
          marker.style.transform = `translate(${(projected.x + 1) * width / 2}px, ${(1 - projected.y) * height / 2}px) translate(-50%, -50%)`;
        }
      }
      // Lightweight DOM diagnostics also support browser checks without exposing
      // renderer internals or installing a global test API.
      const view = currentViewport();
      element.dataset.distance = view.distance.toFixed(4);
      element.dataset.centerLat = view.center.lat.toFixed(4);
      element.dataset.centerLon = view.center.lon.toFixed(4);
      // Finish the marker's rotation/zoom before handing off. Manual wheel/
      // pinch entry remains automatic and does not force a study-area fit.
      if (!transitioned && !focus && view.distance < MAP_TRANSITION_DISTANCE) {
        transitioned = true;
        controls.enabled = false;
        callbacks.current.onViewportChange?.(view);
        callbacks.current.onEnterMap?.(view, { focusStudyArea: enteringStudyArea });
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    const onContextLost = (event) => {
      event.preventDefault();
      setStatus("error");
      setError("The globe's graphics context was lost. Reload the page to reconnect.");
      cancelAnimationFrame(frame);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      focusSite.current = null;
      sitePositions.current = [];
      controls.removeEventListener("start", onControlStart);
      controls.removeEventListener("end", publishViewport);
      controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <section ref={host} className="mars-globe" aria-label="Mars globe" data-status={status}>
      <div className="globe-markers">
        {sites.map((site) => (
          <button key={site.id} ref={(element) => {
            if (element) markers.current.set(site.id, element);
            else markers.current.delete(site.id);
          }} type="button" className="globe-marker" data-site={site.id} hidden
            aria-label={`Zoom to ${site.name}`} onClick={() => focusSite.current?.(site.id)}>
            <span className="globe-marker-label">{site.name}</span>
            <span className="globe-marker-dot" />
          </button>
        ))}
      </div>
      {status === "loading" && <p className="globe-message" role="status">Loading Mars…</p>}
      {(error || siteError) && <p className="globe-message globe-error" role="alert">{error || siteError}</p>}
      <a className="texture-credit" href="https://www.solarsystemscope.com/textures/"
        target="_blank" rel="noreferrer">Mars texture: Solar System Scope · CC BY 4.0</a>
    </section>
  );
}
