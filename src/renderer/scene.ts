import * as THREE from 'three';
import { MochiMotion } from './motion';
import type { CareAction, GameState, PetBehavior } from './types';

type PickHandler = (action: CareAction) => void;
export type SceneRoom = 'room' | 'garden';

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
  private readonly motion = new MochiMotion();
  private readonly previousPetPosition = new THREE.Vector3();
  private shadow!: THREE.Mesh;
  private actionPulse = 0;
  private exitProgress = 0;
  private target = new THREE.Vector3(0, 0, 0);
  private behavior: PetBehavior = 'idle';
  private state: GameState | null = null;
  private room: SceneRoom = 'room';

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
    this.setRoom('room');
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

    this.scene.background = new THREE.Color(
      this.room === 'garden' ? (act === 1 ? '#17231b' : '#101812') : act === 1 ? '#171b22' : act === 2 ? '#13151b' : '#0d0d12'
    );
    this.scene.fog = new THREE.Fog(
      this.room === 'garden' ? '#17231b' : act === 1 ? '#171b22' : '#0b0b10',
      this.room === 'garden' ? 7 : act === 1 ? 12 : 7,
      this.room === 'garden' ? 16 : act === 1 ? 22 : 14
    );

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
    const beforeMove = this.previousPetPosition.copy(this.pet.position);

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
    const velocity = beforeMove.distanceTo(this.pet.position) / Math.max(delta, 0.016);
    const pose = this.motion.sample({
      behavior: this.behavior,
      act,
      time: elapsed,
      velocity: Math.min(1, velocity * 2.8),
      attention: this.actionPulse
    });

    this.pet.position.y += pose.bodyY;
    this.pet.scale.y = pose.bodySquashY - (this.behavior === 'sleep' ? 0.12 : 0);
    this.pet.scale.x = pose.bodySquashX + this.actionPulse * 0.04 + (this.behavior === 'sleep' ? 0.1 : 0);
    this.pet.scale.z = 1 + (this.behavior === 'stare' ? wrongness * 0.08 : 0);

    this.bodyCore.rotation.z = pose.bodyRoll;
    this.bodyCore.rotation.x = pose.bodyPitch;
    this.head.rotation.x = pose.headPitch;
    this.head.rotation.y = pose.headYaw;
    this.head.rotation.z = pose.headRoll;

    this.tail.rotation.z = pose.tailCurl;
    this.tail.rotation.y = pose.tailYaw;
    this.tail.rotation.x = pose.tailLift;
    this.eyes.forEach((eye, index) => {
      eye.scale.y = pose.eyeOpen;
      eye.scale.x = pose.pupilScale;
      eye.position.x = (index === 0 ? -0.15 : 0.15) + Math.sin(elapsed * 0.9) * 0.018;
    });
    this.ears.forEach((ear, index) => {
      ear.rotation.z = (index === 0 ? 0.26 + pose.earLeft : -0.26 + pose.earRight);
    });
    this.paws.forEach((paw, index) => {
      paw.position.y = 0.18 + pose.pawLift[index];
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

  setRoom(room: SceneRoom) {
    this.room = room;
    this.camera.position.set(room === 'room' ? 0 : -0.2, room === 'room' ? 3.4 : 3.8, room === 'room' ? 8.4 : 7.4);
    this.camera.lookAt(room === 'room' ? 0 : -1.2, room === 'room' ? 1.1 : 0.65, room === 'room' ? 0 : -0.55);
    this.interactives.forEach((object) => {
      const action = object.userData.action as CareAction;
      object.visible = room === 'garden' ? action === 'tend' : action !== 'tend';
    });
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
    const floorMat = new THREE.MeshStandardMaterial({ color: '#2a2630', roughness: 0.86, metalness: 0.02 });
    const wallMat = new THREE.MeshStandardMaterial({ color: '#34313a', roughness: 0.9 });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#b88f68', roughness: 0.7 });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.16, 4.8), floorMat);
    floor.position.set(0, -0.08, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const gardenGround = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.12, 4.8),
      new THREE.MeshStandardMaterial({ color: '#1f3828', roughness: 0.94 })
    );
    gardenGround.position.set(0, -0.015, 0);
    gardenGround.receiveShadow = true;
    gardenGround.userData.action = 'tend';
    this.interactives.push(gardenGround);
    this.scene.add(gardenGround);

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
    this.addInteractive('tend', new THREE.Vector3(-2.55, 0.18, -0.75), '#8c674f', 'garden');
    this.addInteractive('tend', new THREE.Vector3(-1.25, 0.18, -0.55), '#8c674f', 'garden');
    this.addInteractive('tend', new THREE.Vector3(0.05, 0.18, -0.85), '#8c674f', 'garden');

    const light = new THREE.DirectionalLight('#ffdcb6', 2.15);
    light.position.set(2.7, 4.7, 3.5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    this.scene.add(light);
    this.scene.add(new THREE.HemisphereLight('#97b7ff', '#4c2f26', 1.25));
  }

  private addInteractive(action: CareAction, position: THREE.Vector3, color: string, shape: 'bowl' | 'ball' | 'brush' | 'bed' | 'garden') {
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
    } else if (shape === 'garden') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 0.64), material);
      mesh.position.y -= 0.03;
      const soil = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.06, 0.48),
        new THREE.MeshStandardMaterial({ color: '#3b2a22', roughness: 0.95 })
      );
      soil.position.y = 0.18;
      soil.castShadow = true;
      mesh.add(soil);

      for (let i = 0; i < 7; i += 1) {
        const sprout = new THREE.Group();
        const stem = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.018, 0.24 + (i % 3) * 0.05, 4, 8),
          new THREE.MeshStandardMaterial({ color: '#6fc48e', roughness: 0.7 })
        );
        stem.position.y = 0.34 + (i % 3) * 0.02;
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 12, 8),
          new THREE.MeshStandardMaterial({ color: i % 2 ? '#9ee6c9' : '#79c8b7', roughness: 0.72 })
        );
        leaf.position.set(0.04, 0.48 + (i % 3) * 0.04, 0);
        leaf.scale.set(1.35, 0.46, 0.82);
        const bloom = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 10, 8),
          new THREE.MeshStandardMaterial({ color: i % 2 ? '#f2d2a8' : '#e7c6d8', roughness: 0.68 })
        );
        bloom.position.set(-0.02, 0.56 + (i % 3) * 0.04, 0.02);
        sprout.add(stem, leaf, bloom);
        sprout.position.set(-0.4 + i * 0.14, 0, (i % 2 ? 0.12 : -0.1));
        sprout.rotation.z = -0.12 + i * 0.04;
        sprout.userData.float = true;
        sprout.userData.baseY = sprout.position.y;
        sprout.userData.speed = 0.9 + i * 0.08;
        mesh.add(sprout);
      }
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
    const fur = new THREE.MeshStandardMaterial({ color: '#8f8175', roughness: 0.74 });
    const chest = new THREE.MeshStandardMaterial({ color: '#d8c7b6', roughness: 0.76 });
    const shade = new THREE.MeshStandardMaterial({ color: '#5f564f', roughness: 0.8 });
    const stripe = new THREE.MeshStandardMaterial({ color: '#3f3936', roughness: 0.86 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#11131a', roughness: 0.35 });

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.74, 40),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0, 0.004, 0.1);
    this.scene.add(this.shadow);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.54, 40, 24), fur);
    body.scale.set(1.58, 0.72, 0.78);
    body.position.set(0, 0.56, -0.05);
    body.castShadow = true;
    this.bodyCore.add(body);

    const chestPatch = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), chest);
    chestPatch.scale.set(0.86, 0.58, 0.24);
    chestPatch.position.set(0, 0.56, 0.42);
    chestPatch.castShadow = true;
    this.bodyCore.add(chestPatch);

    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), shade);
    haunch.scale.set(1.25, 0.82, 0.92);
    haunch.position.set(-0.34, 0.44, -0.34);
    haunch.castShadow = true;
    this.bodyCore.add(haunch);
    this.pet.add(this.bodyCore);

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 16), fur);
    shoulder.scale.set(1, 0.78, 0.82);
    shoulder.position.set(0.48, 0.55, 0.12);
    shoulder.castShadow = true;
    this.bodyCore.add(shoulder);

    for (const x of [-0.36, -0.12, 0.12, 0.36]) {
      const bodyStripe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.31, 0.012), stripe);
      bodyStripe.position.set(x, 0.74, 0.42);
      bodyStripe.rotation.z = x * 0.7;
      this.bodyCore.add(bodyStripe);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 36, 20), fur);
    head.position.set(0, 0, 0.04);
    head.scale.set(1.02, 0.9, 0.96);
    head.castShadow = true;
    this.head.position.set(0.42, 1.03, 0.16);
    this.head.add(head);

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 12), chest);
    muzzle.position.set(0, -0.08, 0.35);
    muzzle.scale.set(1.45, 0.62, 0.72);
    this.head.add(muzzle);

    for (const x of [-0.18, 0, 0.18]) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.15, 0.012), stripe);
      mark.position.set(x, 0.2, 0.39);
      mark.rotation.z = x * 1.2;
      this.head.add(mark);
    }

    for (const x of [-0.28, 0.28]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 4), fur);
      ear.position.set(x, 0.34, -0.02);
      ear.rotation.z = x < 0 ? 0.35 : -0.35;
      ear.rotation.y = Math.PI / 4;
      ear.castShadow = true;
      this.ears.push(ear);
      this.head.add(ear);
    }

    for (const x of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.052, 18, 12), eyeMat);
      eye.position.set(x, 0.03, 0.39);
      this.eyes.push(eye);
      this.head.add(eye);
    }

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10), new THREE.MeshStandardMaterial({ color: '#f0a2b5' }));
    nose.position.set(0, -0.09, 0.5);
    nose.scale.set(1.15, 0.75, 0.65);
    this.head.add(nose);
    this.pet.add(this.head);

    for (let i = 0; i < 5; i += 1) {
      const segment = new THREE.Mesh(new THREE.CapsuleGeometry(0.06 - i * 0.004, 0.24, 8, 14), i % 2 ? shade : fur);
      segment.position.set(-0.64 - i * 0.13, 0.58 + i * 0.08, -0.16);
      segment.rotation.z = Math.PI / 2.3 - i * 0.18;
      segment.rotation.y = -0.24;
      segment.castShadow = true;
      this.tail.add(segment);
    }
    this.pet.add(this.tail);

    for (const [x, z, scale] of [
      [0.34, 0.28, 1.0],
      [0.62, 0.2, 1.0],
      [-0.42, -0.28, 1.12],
      [-0.12, -0.32, 1.12]
    ] as const) {
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), shade);
      paw.position.set(x, 0.18, z);
      paw.scale.set(0.82 * scale, 0.78, 0.62);
      paw.castShadow = true;
      this.paws.push(paw);
      this.pet.add(paw);
    }

    for (const x of [-0.36, 0.36]) {
      const whisker = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.012, 0.012), chest);
      whisker.position.set(x + 0.42, 0.96, 0.5);
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
