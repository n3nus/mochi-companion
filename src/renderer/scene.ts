import * as THREE from 'three';
import type { CareAction, GameState, PetBehavior } from './types';

type PickHandler = (action: CareAction) => void;

export class CompanionScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly clock = new THREE.Clock();
  private readonly pet = new THREE.Group();
  private readonly bodyCore = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly eyes: THREE.Mesh[] = [];
  private readonly ears: THREE.Mesh[] = [];
  private readonly paws: THREE.Mesh[] = [];
  private readonly interactives: THREE.Object3D[] = [];
  private shadow!: THREE.Mesh;
  private actionPulse = 0;
  private exitProgress = 0;
  private target = new THREE.Vector3(0, 0, 0);
  private behavior: PetBehavior = 'idle';
  private state: GameState | null = null;

  constructor(private readonly mount: HTMLElement, private readonly onPick: PickHandler) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'scene-canvas';
    this.mount.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 3.4, 8.4);
    this.camera.lookAt(0, 1.1, 0);

    this.buildRoom();
    this.buildPet();
    this.resize();
    this.mount.addEventListener('pointerdown', this.handlePointer);
    window.addEventListener('resize', this.resize);
  }

  dispose() {
    this.mount.removeEventListener('pointerdown', this.handlePointer);
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }

  setState(state: GameState) {
    this.state = state;
    this.behavior = state.pet.currentBehavior;
    const act = state.story.act;

    this.scene.background = new THREE.Color(act === 1 ? '#171b22' : act === 2 ? '#13151b' : '#0d0d12');
    this.scene.fog = new THREE.Fog(act === 1 ? '#171b22' : '#0b0b10', act === 1 ? 12 : 7, act === 1 ? 22 : 14);

    if (this.behavior === 'eat') this.target.set(-1.9, 0, 0.7);
    if (this.behavior === 'play') this.target.set(1.7, 0, 0.2);
    if (this.behavior === 'sleep') this.target.set(2.15, 0, 1.1);
    if (this.behavior === 'approach') this.target.set(0, 0, 0.35);
    if (this.behavior === 'stare' || this.behavior === 'follow') this.target.set(0, 0, -0.35);
    if (this.behavior === 'refuse') this.target.set(-0.2, 0, -0.85);

    this.actionPulse = 1;
  }

  startExit() {
    this.behavior = 'exit';
    this.exitProgress = 0.001;
  }

  update() {
    const elapsed = this.clock.getElapsedTime();
    const delta = this.clock.getDelta();
    this.actionPulse = Math.max(0, this.actionPulse - delta * 1.8);

    if (this.behavior === 'exit') {
      this.exitProgress = Math.min(1, this.exitProgress + delta * 0.18);
      this.pet.position.x = THREE.MathUtils.lerp(0, 4.8, this.exitProgress);
      this.pet.position.y = Math.sin(this.exitProgress * Math.PI) * 0.55;
      this.pet.rotation.y = THREE.MathUtils.lerp(0, -0.8, this.exitProgress);
    } else {
      this.pet.position.lerp(this.target, 0.045);
      this.pet.position.y = Math.sin(elapsed * this.motionSpeed()) * this.motionLift();
      this.pet.rotation.y = THREE.MathUtils.lerp(
        this.pet.rotation.y,
        this.target.x < this.pet.position.x - 0.08 ? 0.28 : this.target.x > this.pet.position.x + 0.08 ? -0.28 : 0,
        0.04
      );
    }

    const act = this.state?.story.act ?? 1;
    const wrongness = act === 1 ? 0 : act === 2 ? 0.25 : 0.55;
    const breathe = Math.sin(elapsed * (1.5 + wrongness)) * (0.018 + wrongness * 0.025);
    this.pet.scale.y = 1 + breathe - (this.behavior === 'sleep' ? 0.12 : 0);
    this.pet.scale.x = 1 + this.actionPulse * 0.04 + (this.behavior === 'sleep' ? 0.1 : 0);
    this.pet.scale.z = 1 + (this.behavior === 'stare' ? wrongness * 0.08 : 0);

    this.bodyCore.rotation.z = Math.sin(elapsed * 1.1) * 0.025;
    this.head.rotation.x = this.behavior === 'eat' ? 0.24 + Math.sin(elapsed * 9) * 0.11 : this.behavior === 'sleep' ? 0.34 : 0;
    this.head.rotation.z =
      this.behavior === 'stare' || this.behavior === 'follow'
        ? Math.sin(elapsed * 0.7) * 0.045
        : Math.sin(elapsed * 1.4) * 0.025;

    this.tail.rotation.z = Math.sin(elapsed * (act === 3 ? 7 : this.behavior === 'play' ? 5 : 2.4)) * (act === 3 ? 0.45 : 0.22);
    this.tail.rotation.y = Math.sin(elapsed * 1.8) * 0.12;
    this.eyes.forEach((eye, index) => {
      eye.scale.y = this.behavior === 'sleep' ? 0.08 : Math.sin(elapsed * 2.8 + index) > 0.96 ? 0.08 : 1;
      eye.position.x = (index === 0 ? -0.15 : 0.15) + Math.sin(elapsed * 0.9) * 0.018;
    });
    this.ears.forEach((ear, index) => {
      ear.rotation.z = (index === 0 ? 0.26 : -0.26) + Math.sin(elapsed * 3.1 + index * 1.7) * 0.035;
    });
    this.paws.forEach((paw, index) => {
      const step = this.behavior === 'play' || this.behavior === 'approach' ? Math.sin(elapsed * 8 + index * Math.PI) * 0.045 : 0;
      paw.position.y = 0.18 + Math.max(0, step);
    });
    if (this.shadow) {
      this.shadow.position.x = this.pet.position.x;
      this.shadow.position.z = this.pet.position.z + 0.08;
      this.shadow.scale.setScalar(1 + Math.abs(this.pet.position.y) * 0.2);
    }

    this.scene.traverse((object) => {
      if (object.userData.float) {
        object.position.y = object.userData.baseY + Math.sin(elapsed * object.userData.speed) * 0.04;
      }
      if (object.userData.actShift) {
        object.rotation.z = Math.sin(elapsed * 1.2) * wrongness * 0.04;
      }
    });

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.update());
  }

  private motionSpeed() {
    if (this.behavior === 'play') return 5.8;
    if (this.behavior === 'approach' || this.behavior === 'eat') return 3.2;
    if (this.behavior === 'sleep') return 0.7;
    return 2.1;
  }

  private motionLift() {
    if (this.behavior === 'play') return 0.11;
    if (this.behavior === 'approach') return 0.055;
    if (this.behavior === 'sleep') return 0.012;
    return 0.035;
  }

  private buildRoom() {
    const floorMat = new THREE.MeshStandardMaterial({ color: '#242735', roughness: 0.86, metalness: 0.02 });
    const wallMat = new THREE.MeshStandardMaterial({ color: '#303443', roughness: 0.9 });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#b88f68', roughness: 0.7 });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.16, 4.8), floorMat);
    floor.position.set(0, -0.08, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const back = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.8, 0.18), wallMat);
    back.position.set(0, 1.85, -2.35);
    back.receiveShadow = true;
    back.userData.actShift = true;
    this.scene.add(back);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.8, 4.8), wallMat);
    left.position.set(-3.6, 1.85, 0);
    left.receiveShadow = true;
    this.scene.add(left);

    const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.05, 0.08), trimMat);
    windowFrame.position.set(1.55, 2.25, -2.22);
    this.scene.add(windowFrame);

    const windowGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 0.78),
      new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.48 })
    );
    windowGlow.position.set(1.55, 2.25, -2.17);
    this.scene.add(windowGlow);

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.36), trimMat);
    shelf.position.set(-1.85, 2.1, -2.05);
    shelf.castShadow = true;
    shelf.userData.float = true;
    shelf.userData.baseY = shelf.position.y;
    shelf.userData.speed = 0.45;
    this.scene.add(shelf);

    this.addInteractive('feed', new THREE.Vector3(-2.05, 0.16, 0.9), '#d99c76', 'bowl');
    this.addInteractive('play', new THREE.Vector3(1.65, 0.22, 0.15), '#bd5d64', 'ball');
    this.addInteractive('comfort', new THREE.Vector3(-0.05, 0.22, 1.5), '#8ccfc0', 'brush');
    this.addInteractive('rest', new THREE.Vector3(2.25, 0.13, 1.05), '#7177a8', 'bed');

    const light = new THREE.DirectionalLight('#ffdcb6', 2.15);
    light.position.set(2.7, 4.7, 3.5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    this.scene.add(light);
    this.scene.add(new THREE.HemisphereLight('#97b7ff', '#4c2f26', 1.25));
  }

  private addInteractive(action: CareAction, position: THREE.Vector3, color: string, shape: 'bowl' | 'ball' | 'brush' | 'bed') {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.03 });
    let mesh: THREE.Mesh;

    if (shape === 'ball') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 18), material);
    } else if (shape === 'bed') {
      mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.75, 8, 24), material);
      mesh.rotation.z = Math.PI / 2;
      mesh.scale.z = 0.35;
    } else if (shape === 'brush') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.2), material);
      mesh.rotation.z = -0.25;
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.18, 32), material);
    }

    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.action = action;
    mesh.userData.float = shape === 'ball';
    mesh.userData.baseY = position.y;
    mesh.userData.speed = 1.6;
    this.interactives.push(mesh);
    this.scene.add(mesh);
  }

  private buildPet() {
    const fur = new THREE.MeshStandardMaterial({ color: '#caa2d7', roughness: 0.68 });
    const chest = new THREE.MeshStandardMaterial({ color: '#e7c6d8', roughness: 0.72 });
    const shade = new THREE.MeshStandardMaterial({ color: '#9471ad', roughness: 0.78 });
    const stripe = new THREE.MeshStandardMaterial({ color: '#7f5d96', roughness: 0.84 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#11131a', roughness: 0.35 });

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.74, 40),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0, 0.004, 0.1);
    this.scene.add(this.shadow);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.54, 32, 22), fur);
    body.scale.set(1.25, 0.82, 0.88);
    body.position.y = 0.58;
    body.castShadow = true;
    this.bodyCore.add(body);

    const chestPatch = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), chest);
    chestPatch.scale.set(0.75, 0.55, 0.28);
    chestPatch.position.set(0, 0.6, 0.43);
    chestPatch.castShadow = true;
    this.bodyCore.add(chestPatch);

    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), shade);
    haunch.scale.set(1.2, 0.82, 0.92);
    haunch.position.set(-0.12, 0.44, -0.32);
    haunch.castShadow = true;
    this.bodyCore.add(haunch);
    this.pet.add(this.bodyCore);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 20), fur);
    head.position.set(0, 0, 0.04);
    head.scale.set(1.08, 0.92, 0.98);
    head.castShadow = true;
    this.head.position.set(0, 1.08, 0.04);
    this.head.add(head);

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 12), chest);
    muzzle.position.set(0, -0.08, 0.37);
    muzzle.scale.set(1.35, 0.58, 0.7);
    this.head.add(muzzle);

    for (const x of [-0.18, 0, 0.18]) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.012), stripe);
      mark.position.set(x, 0.2, 0.39);
      mark.rotation.z = x * 1.2;
      this.head.add(mark);
    }

    for (const x of [-0.28, 0.28]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.38, 4), fur);
      ear.position.set(x, 0.36, -0.02);
      ear.rotation.z = x < 0 ? 0.35 : -0.35;
      ear.rotation.y = Math.PI / 4;
      ear.castShadow = true;
      this.ears.push(ear);
      this.head.add(ear);
    }

    for (const x of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 18, 12), eyeMat);
      eye.position.set(x, 0.04, 0.42);
      this.eyes.push(eye);
      this.head.add(eye);
    }

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10), new THREE.MeshStandardMaterial({ color: '#f0a2b5' }));
    nose.position.set(0, -0.09, 0.5);
    nose.scale.set(1.15, 0.75, 0.65);
    this.head.add(nose);
    this.pet.add(this.head);

    const tailRoot = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.78, 8, 16), shade);
    tailRoot.position.set(0.52, 0.61, -0.06);
    tailRoot.rotation.z = Math.PI / 2.7;
    tailRoot.rotation.y = -0.2;
    tailRoot.castShadow = true;
    this.tail.add(tailRoot);
    this.pet.add(this.tail);

    for (const [x, z, scale] of [
      [-0.34, 0.28, 1.0],
      [0.34, 0.28, 1.0],
      [-0.42, -0.25, 1.12],
      [0.42, -0.25, 1.12]
    ] as const) {
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), shade);
      paw.position.set(x, 0.18, z);
      paw.scale.set(1.15 * scale, 0.5, 0.8);
      paw.castShadow = true;
      this.paws.push(paw);
      this.pet.add(paw);
    }

    for (const x of [-0.36, 0.36]) {
      const whisker = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.012, 0.012), chest);
      whisker.position.set(x, 1.0, 0.47);
      whisker.rotation.z = x < 0 ? 0.12 : -0.12;
      this.pet.add(whisker);
    }

    this.scene.add(this.pet);
  }

  private handlePointer = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.interactives, false)[0];
    if (hit?.object.userData.action) {
      this.onPick(hit.object.userData.action as CareAction);
      return;
    }
    this.onPick('observe');
  };

  private resize = () => {
    const { clientWidth, clientHeight } = this.mount;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / Math.max(1, clientHeight);
    this.camera.updateProjectionMatrix();
  };
}
