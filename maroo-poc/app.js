import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const elements = {
  file: document.querySelector('#glb-file'), fileName: document.querySelector('#file-name'),
  viewer: document.querySelector('#viewer'), viewerPlaceholder: document.querySelector('#viewer-placeholder'),
  modelStatus: document.querySelector('#model-status'), cameraSelect: document.querySelector('#camera-select'),
  cameraToggle: document.querySelector('#camera-toggle'), video: document.querySelector('#camera-preview'),
  videoPlaceholder: document.querySelector('#video-placeholder'), cameraStatus: document.querySelector('#camera-status'),
  liveIndicator: document.querySelector('#live-indicator'),
  meshes: document.querySelector('#stat-meshes'), bones: document.querySelector('#stat-bones'),
  clips: document.querySelector('#stat-clips'), morphs: document.querySelector('#stat-morphs')
};

let renderer;
let scene;
let camera;
let controls;
let activeModel;
let activeObjectUrl = '';
let activeReadRequest;
let mediaStream;
let cameraBusy = false;
let cameraRequestToken = 0;
let lastRenderAt = 0;
const TARGET_RENDER_INTERVAL_MS = 1000 / 24;

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function resetStats() {
  elements.meshes.textContent = '—';
  elements.bones.textContent = '—';
  elements.clips.textContent = '—';
  elements.morphs.textContent = '—';
}

function initializeRenderer() {
  try {
    if (!window.WebGLRenderingContext) throw new Error('WebGL غير مدعوم في هذا المتصفح.');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x0b1018, 1);
    elements.viewer.replaceChildren(renderer.domElement, elements.viewerPlaceholder);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1018);
    camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
    camera.position.set(3.2, 2.2, 4.4);
    scene.add(new THREE.HemisphereLight(0xdceaff, 0x303949, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 7, 5);
    scene.add(keyLight);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 0.8, 0);
    resizeRenderer();
    window.addEventListener('resize', resizeRenderer, { passive: true });
    renderer.setAnimationLoop(renderScene);
  } catch (error) {
    renderer?.dispose();
    renderer = undefined;
    elements.viewer.replaceChildren(elements.viewerPlaceholder);
    elements.viewerPlaceholder.hidden = false;
    elements.viewerPlaceholder.querySelector('strong').textContent = 'WebGL غير متاح';
    elements.viewerPlaceholder.querySelector('span:last-child').textContent = 'تعذر تشغيل العارض؛ تحقق من دعم WebGL في المتصفح.';
    setStatus(elements.modelStatus, error?.message || 'بيئة المتصفح لا تدعم WebGL. يمكنك متابعة فحص الكاميرا.', true);
  }
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const width = Math.max(1, elements.viewer.clientWidth);
  const height = Math.max(1, elements.viewer.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function renderScene(now) {
  if (!renderer || !controls || !scene || !camera || now - lastRenderAt < TARGET_RENDER_INTERVAL_MS) return;
  lastRenderAt = now;
  controls.update();
  renderer.render(scene, camera);
}

function disposeModelResources(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();
  root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    nodeMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value?.isTexture) textures.add(value);
    });
    material.dispose();
  });
  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  skeletons.forEach((skeleton) => skeleton.dispose());
}

function clearModel() {
  if (activeModel && scene) {
    scene.remove(activeModel);
    disposeModelResources(activeModel);
  }
  activeModel = undefined;
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = '';
  if (activeReadRequest) {
    activeReadRequest.abort();
    activeReadRequest = undefined;
  }
}

function countScene(gltf) {
  let meshCount = 0;
  let boneCount = 0;
  let morphCount = 0;
  gltf.scene.traverse((node) => {
    if (node.isMesh) {
      meshCount += 1;
      const targets = node.morphTargetInfluences;
      if (targets) morphCount += targets.length;
    }
    if (node.isBone) boneCount += 1;
  });
  return { meshCount, boneCount, morphCount, clips: gltf.animations.length };
}

function frameModel(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) {
    camera.position.set(3.2, 2.2, 4.4);
    controls.target.set(0, 0.8, 0);
    controls.update();
    return;
  }
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 0.1);
  const distance = (largest / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.55;
  camera.near = Math.max(largest / 1000, 0.001);
  camera.far = Math.max(largest * 100, 100);
  camera.position.set(center.x + distance * 0.7, center.y + distance * 0.45, center.z + distance * 1.2);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance = largest * 0.2;
  controls.maxDistance = largest * 12;
  controls.update();
}

function readObjectUrl(url) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    activeReadRequest = request;
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = () => {
      if (activeReadRequest === request) activeReadRequest = undefined;
      if (request.status === 200 || request.status === 0) resolve(request.response);
      else reject(new Error('تعذرت قراءة الملف المحلي من المتصفح.'));
    };
    request.onerror = () => {
      if (activeReadRequest === request) activeReadRequest = undefined;
      reject(new Error('فشلت قراءة ملف GLB المحلي.'));
    };
    request.onabort = () => {
      if (activeReadRequest === request) activeReadRequest = undefined;
      reject(new DOMException('أُلغي تحميل الملف.', 'AbortError'));
    };
    request.send();
  });
}

async function loadGlb(file) {
  clearModel();
  resetStats();
  elements.viewerPlaceholder.hidden = false;
  elements.viewerPlaceholder.querySelector('strong').textContent = 'جارٍ تحميل الملف محليًا…';
  elements.viewerPlaceholder.querySelector('span:last-child').textContent = 'لا يتم إرسال الملف إلى أي جهة.';
  elements.fileName.textContent = file ? file.name : 'لم يتم اختيار ملف';
  if (!file) {
    setStatus(elements.modelStatus, 'لم يتم تحميل ملف.');
    elements.viewerPlaceholder.querySelector('strong').textContent = 'ستظهر المعاينة هنا';
    elements.viewerPlaceholder.querySelector('span:last-child').textContent = 'اختر ملف GLB لعرضه محليًا';
    return;
  }
  if (!file.name.toLowerCase().endsWith('.glb')) {
    setStatus(elements.modelStatus, 'الملف غير مدعوم؛ اختر ملفًا بامتداد .glb فقط.', true);
    elements.viewerPlaceholder.querySelector('strong').textContent = 'نوع الملف غير مدعوم';
    return;
  }
  if (!renderer) {
    setStatus(elements.modelStatus, 'تعذر العرض لأن WebGL غير متاح؛ لم يُرفع الملف أو يُرسل.', true);
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  activeObjectUrl = objectUrl;
  setStatus(elements.modelStatus, 'قراءة ملف GLB محليًا…');
  try {
    const binary = await readObjectUrl(objectUrl);
    if (activeObjectUrl !== objectUrl) return;
    const gltf = await new GLTFLoader().parseAsync(binary, '');
    if (activeObjectUrl !== objectUrl) {
      disposeModelResources(gltf.scene);
      return;
    }
    activeModel = gltf.scene;
    scene.add(activeModel);
    frameModel(activeModel);
    const stats = countScene(gltf);
    elements.meshes.textContent = String(stats.meshCount);
    elements.bones.textContent = String(stats.boneCount);
    elements.clips.textContent = String(stats.clips);
    elements.morphs.textContent = String(stats.morphCount);
    elements.viewerPlaceholder.hidden = true;
    setStatus(elements.modelStatus, `عُرض الملف محليًا. لا يعني ذلك جاهزية الشخصية أو وجود تتبّع.`);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    if (activeObjectUrl === objectUrl) {
      clearModel();
      elements.viewerPlaceholder.hidden = false;
      elements.viewerPlaceholder.querySelector('strong').textContent = 'تعذر تحميل ملف GLB';
      elements.viewerPlaceholder.querySelector('span:last-child').textContent = 'تحقق من سلامة الملف ومن أنه GLB صالح.';
      setStatus(elements.modelStatus, 'تعذر تحليل الملف. جرّب ملف GLB صالحًا؛ لم يُرسل أي شيء.', true);
    }
  }
}

function stopCamera(message = 'توقفت معاينة الكاميرا.') {
  cameraRequestToken += 1;
  if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
  mediaStream = undefined;
  elements.video.pause();
  elements.video.srcObject = null;
  elements.videoPlaceholder.hidden = false;
  elements.liveIndicator.hidden = true;
  elements.cameraToggle.textContent = 'تشغيل الكاميرا';
  if (message) setStatus(elements.cameraStatus, message);
}

async function refreshCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    elements.cameraSelect.replaceChildren(new Option('قائمة الكاميرات غير متاحة', ''));
    setStatus(elements.cameraStatus, 'المتصفح لا يتيح تعداد الكاميرات.', true);
    return;
  }
  try {
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    const previous = elements.cameraSelect.value;
    elements.cameraSelect.replaceChildren();
    if (!cameras.length) {
      elements.cameraSelect.add(new Option('لم يتم العثور على كاميرا', ''));
      return;
    }
    cameras.forEach((device, index) => {
      elements.cameraSelect.add(new Option(device.label || `كاميرا ${index + 1}`, device.deviceId));
    });
    if (cameras.some((device) => device.deviceId === previous)) elements.cameraSelect.value = previous;
  } catch {
    elements.cameraSelect.replaceChildren(new Option('تعذر فحص قائمة الكاميرات', ''));
    setStatus(elements.cameraStatus, 'تعذر فحص الأجهزة؛ لم تُطلب صلاحية الكاميرا.', true);
  }
}

async function toggleCamera() {
  if (mediaStream) {
    stopCamera();
    return;
  }
  if (cameraBusy) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus(elements.cameraStatus, 'معاينة الكاميرا غير مدعومة هنا؛ استخدم localhost أو سياقًا آمنًا.', true);
    return;
  }
  cameraBusy = true;
  const requestToken = ++cameraRequestToken;
  elements.cameraToggle.disabled = true;
  setStatus(elements.cameraStatus, 'بانتظار إذن المتصفح للكاميرا… لا يُطلب الميكروفون.');
  try {
    const selectedDeviceId = elements.cameraSelect.value;
    const video = {
      width: { ideal: 640 },
      height: { ideal: 360 },
      frameRate: { ideal: 15, max: 24 }
    };
    if (selectedDeviceId) video.deviceId = { exact: selectedDeviceId };
    const requestedStream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    if (requestToken !== cameraRequestToken || document.visibilityState === 'hidden') {
      requestedStream.getTracks().forEach((track) => track.stop());
      return;
    }
    mediaStream = requestedStream;
    const videoTracks = requestedStream.getVideoTracks();
    videoTracks.forEach((track) => {
      track.addEventListener('ended', () => {
        if (mediaStream === requestedStream) stopCamera('انقطع مصدر الكاميرا؛ اضغط تشغيل للمحاولة مجددًا.');
      }, { once: true });
    });
    if (videoTracks.some((track) => track.readyState === 'ended')) {
      stopCamera('انقطع مصدر الكاميرا؛ اضغط تشغيل للمحاولة مجددًا.');
      return;
    }
    elements.video.srcObject = mediaStream;
    await elements.video.play();
    if (requestToken !== cameraRequestToken || document.visibilityState === 'hidden' || mediaStream !== requestedStream) {
      requestedStream.getTracks().forEach((track) => track.stop());
      if (mediaStream === requestedStream) stopCamera('');
      return;
    }
    elements.videoPlaceholder.hidden = true;
    elements.liveIndicator.hidden = false;
    elements.cameraToggle.textContent = 'إيقاف الكاميرا';
    setStatus(elements.cameraStatus, 'معاينة محلية فقط. لا تسجيل أو تخزين أو إرسال، ولا تتبّع أو تحريك.');
    await refreshCameras();
  } catch (error) {
    stopCamera('');
    const reason = error?.name === 'NotAllowedError' ? 'لم يُسمح بالوصول إلى الكاميرا.'
      : error?.name === 'NotFoundError' ? 'لم يتم العثور على كاميرا متاحة.'
        : error?.name === 'NotReadableError' ? 'الكاميرا مشغولة أو تعذر فتحها.'
          : 'تعذر تشغيل الكاميرا في هذا المتصفح أو السياق.';
    setStatus(elements.cameraStatus, `${reason} لا يُطلب الميكروفون.`, true);
  } finally {
    cameraBusy = false;
    elements.cameraToggle.disabled = false;
  }
}

elements.file.addEventListener('change', () => loadGlb(elements.file.files?.[0]));
elements.cameraToggle.addEventListener('click', toggleCamera);
elements.cameraSelect.addEventListener('change', () => {
  if (mediaStream || cameraBusy) {
    stopCamera('تغير الاختيار؛ أُلغي الطلب/المعاينة. اضغط تشغيل لاستخدام الكاميرا المحددة.');
  }
});
window.addEventListener('pagehide', () => {
  stopCamera('');
  renderer?.setAnimationLoop(null);
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted || !renderer) return;
  lastRenderAt = 0;
  renderer.setAnimationLoop(renderScene);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stopCamera('');
});

initializeRenderer();
void refreshCameras();
