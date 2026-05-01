import * as THREE from 'three';
import { MochiMotion } from './motion';
import type { CareAction, GameState, PetBehavior } from './types';

type PickHandler = (action: CareAction) => void;
export type SceneRoom = 'room' | 'garden';

interface LegRig {
  root: THREE.Group;
  lower: THREE.Mesh;
  paw: THREE.Mesh;
  base: THREE.Vector3;
  phase: number;
  front: boolean;
}

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
  private readonly legRigs: LegRig[] = [];
  private readonly tailJoints: THREE.Group[] = [];
  private readonly interactives: THREE.Object3D[] = [];
  private readonly roomObjects: THREE.Object3D[] = [];
  private readonly gardenObjects: THREE.Object3D[] = [];
  private readonly motion = new MochiMotion();
  private readonly previousPetPosition = new THREE.Vector3();
  private shadow!: THREE.Mesh;
  private actionPulse = 0;
  private exitProgress = 0;
  private target = new THREE.Vector3(0, 0, 0);
  private behavior: PetBehavior = 'idle';
  private state: GameState | null = null;
  private room: SceneRoom = 'room';
  private nextWanderAt = 0;

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
    const previousBehavior = this.behavior;
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

    if (previousBehavior !== this.behavior) {
      this.actionPulse = 1;
      this.nextWanderAt = this.clock.getElapsedTime() + 1.8;
    }
  }

  startExit() {
    this.behavior = 'exit';
    this.exitProgress = 0.001;
  }

  update() {
    const elapsed = this.clock.getElapsedTime();
    const delta = this.clock.getDelta();
    this.updateIdleTarget(elapsed);
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
    this.tailJoints.forEach((joint, index) => {
      const depth = index / Math.max(1, this.tailJoints.length - 1);
      joint.rotation.z =
        (joint.userData.baseZ as number) + pose.tailCurl * (0.22 + depth * 0.34) + Math.sin(elapsed * 2.1 + index) * 0.035;
      joint.rotation.y = pose.tailYaw * (0.28 + depth * 0.22);
      joint.rotation.x = pose.tailLift * (0.18 + depth * 0.18);
    });
    this.eyes.forEach((eye, index) => {
      eye.scale.y = pose.eyeOpen;
      eye.scale.x = pose.pupilScale;
      eye.position.x = (index === 0 ? -0.15 : 0.15) + Math.sin(elapsed * 0.9) * 0.018;
    });
    this.ears.forEach((ear, index) => {
      ear.rotation.z = (index === 0 ? 0.26 + pose.earLeft : -0.26 + pose.earRight);
    });
    const legEnergy = Math.min(1, velocity * 2.4 + (this.behavior === 'play' ? 0.45 : 0));
    this.legRigs.forEach((leg, index) => {
      const lift = pose.pawLift[index] ?? 0;
      const step = Math.sin(elapsed * (this.behavior === 'play' ? 8.8 : 6.4) + leg.phase) * legEnergy;
      const side = leg.base.z < 0 ? -1 : 1;
      leg.root.position.y = leg.base.y + lift * 0.72;
      leg.root.position.x = leg.base.x + step * (leg.front ? 0.04 : 0.035);
      leg.root.position.z = leg.base.z + side * Math.abs(step) * 0.018;
      leg.root.rotation.x = step * (leg.front ? 0.38 : 0.31);
      leg.root.rotation.z = side * (0.05 + lift * 0.22);
      leg.lower.rotation.x = -0.26 - Math.max(0, step) * 0.18 + lift * 0.95;
      leg.paw.rotation.x = -step * 0.18 - lift * 0.65;
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
    this.roomObjects.forEach((object) => {
      object.visible = room === 'room';
    });
    this.gardenObjects.forEach((object) => {
      object.visible = room === 'garden';
    });
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

  private updateIdleTarget(elapsed: number) {
    if (this.behavior !== 'idle' || elapsed < this.nextWanderAt || this.exitProgress > 0) return;

    const xMin = this.room === 'garden' ? -2.25 : -2.05;
    const xMax = this.room === 'garden' ? 1.1 : 2.0;
    const zMin = this.room === 'garden' ? -1.0 : -0.75;
    const zMax = this.room === 'garden' ? 0.95 : 1.25;
    this.target.set(THREE.MathUtils.lerp(xMin, xMax, Math.random()), 0, THREE.MathUtils.lerp(zMin, zMax, Math.random()));
    this.nextWanderAt = elapsed + 3.4 + Math.random() * 3.2;
  }

  private buildRoom() {
    const floorMat = new THREE.MeshStandardMaterial({ color: '#2a2630', roughness: 0.86, metalness: 0.02 });
    const wallMat = new THREE.MeshStandardMaterial({ color: '#34313a', roughness: 0.9 });
    const trimMat = new THREE.MeshStandardMaterial({ color: '#b88f68', roughness: 0.7 });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.16, 4.8), floorMat);
    floor.position.set(0, -0.08, 0);
    floor.receiveShadow = true;
    this.roomObjects.push(floor);
    this.scene.add(floor);

    const gardenGround = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.12, 4.8),
      new THREE.MeshStandardMaterial({ color: '#29442d', roughness: 0.94 })
    );
    gardenGround.position.set(0, -0.015, 0);
    gardenGround.receiveShadow = true;
    gardenGround.userData.action = 'tend';
    this.interactives.push(gardenGround);
    this.gardenObjects.push(gardenGround);
    this.scene.add(gardenGround);

    const gardenBack = new THREE.Mesh(
      new THREE.PlaneGeometry(9.4, 4.8),
      new THREE.MeshBasicMaterial({
        color: '#7fb79a',
        transparent: true,
        opacity: 0.52
      })
    );
    gardenBack.position.set(0, 2.15, -2.56);
    this.gardenObjects.push(gardenBack);
    this.scene.add(gardenBack);

    const fenceMat = new THREE.MeshStandardMaterial({ color: '#c8a475', roughness: 0.82 });
    for (let i = 0; i < 9; i += 1) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.1), fenceMat);
      post.position.set(-3.3 + i * 0.82, 0.5, -2.18);
      post.castShadow = true;
      this.gardenObjects.push(post);
      this.scene.add(post);
    }
    for (const y of [0.28, 0.68]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.09, 0.1), fenceMat);
      rail.position.set(0, y, -2.12);
      rail.castShadow = true;
      this.gardenObjects.push(rail);
      this.scene.add(rail);
    }

    const back = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.8, 0.18), wallMat);
    back.position.set(0, 1.85, -2.35);
    back.receiveShadow = true;
    back.userData.actShift = true;
    this.roomObjects.push(back);
    this.scene.add(back);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.8, 4.8), wallMat);
    left.position.set(-3.6, 1.85, 0);
    left.receiveShadow = true;
    this.roomObjects.push(left);
    this.scene.add(left);

    const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.05, 0.08), trimMat);
    windowFrame.position.set(1.55, 2.25, -2.22);
    this.roomObjects.push(windowFrame);
    this.scene.add(windowFrame);

    const windowGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 0.78),
      new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.48 })
    );
    windowGlow.position.set(1.55, 2.25, -2.17);
    this.roomObjects.push(windowGlow);
    this.scene.add(windowGlow);

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.36), trimMat);
    shelf.position.set(-1.85, 2.1, -2.05);
    shelf.castShadow = true;
    shelf.userData.float = true;
    shelf.userData.baseY = shelf.position.y;
    shelf.userData.speed = 0.45;
    this.roomObjects.push(shelf);
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
    if (action === 'tend') {
      this.gardenObjects.push(mesh);
    } else {
      this.roomObjects.push(mesh);
    }
    this.scene.add(mesh);
  }

  private buildPet() {
    const fur = new THREE.MeshStandardMaterial({ color: '#8b7b6d', roughness: 0.82, metalness: 0.01 });
    const furWarm = new THREE.MeshStandardMaterial({ color: '#a39180', roughness: 0.84, metalness: 0.01 });
    const chest = new THREE.MeshStandardMaterial({ color: '#d8c7b6', roughness: 0.79 });
    const shade = new THREE.MeshStandardMaterial({ color: '#5e554d', roughness: 0.86 });
    const stripe = new THREE.MeshStandardMaterial({ color: '#37312d', roughness: 0.9 });
    const innerEar = new THREE.MeshStandardMaterial({ color: '#c99d9b', roughness: 0.78 });
    const irisMat = new THREE.MeshStandardMaterial({ color: '#9fb66a', roughness: 0.38, emissive: '#18220d', emissiveIntensity: 0.18 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: '#07080a', roughness: 0.24 });
    const noseMat = new THREE.MeshStandardMaterial({ color: '#7b4c4c', roughness: 0.58 });
    const whiskerMat = new THREE.MeshBasicMaterial({ color: '#eee2d2' });

    const ellipsoid = (
      parent: THREE.Group,
      material: THREE.Material,
      position: THREE.Vector3,
      scale: THREE.Vector3,
      segments = 36
    ) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(14, Math.floor(segments * 0.55))), material);
      mesh.position.copy(position);
      mesh.scale.copy(scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.92, 48),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0, 0.006, 0.08);
    this.scene.add(this.shadow);

    ellipsoid(this.bodyCore, fur, new THREE.Vector3(-0.08, 0.58, 0), new THREE.Vector3(0.92, 0.42, 0.36), 44);
    ellipsoid(this.bodyCore, furWarm, new THREE.Vector3(0.42, 0.61, 0.03), new THREE.Vector3(0.42, 0.34, 0.34), 34);
    ellipsoid(this.bodyCore, shade, new THREE.Vector3(-0.55, 0.57, -0.02), new THREE.Vector3(0.5, 0.38, 0.36), 34);
    ellipsoid(this.bodyCore, chest, new THREE.Vector3(0.34, 0.53, 0.34), new THREE.Vector3(0.32, 0.22, 0.1), 28);
    this.pet.add(this.bodyCore);

    for (const [x, z, roll, length] of [
      [-0.58, 0.28, -0.5, 0.24],
      [-0.34, 0.32, -0.22, 0.28],
      [-0.08, 0.34, 0.05, 0.3],
      [0.2, 0.31, 0.28, 0.24],
      [-0.42, -0.3, 0.28, 0.18],
      [0.08, -0.31, -0.22, 0.2]
    ] as const) {
      const bodyStripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, length, 6, 10), stripe);
      bodyStripe.position.set(x, 0.87, z);
      bodyStripe.rotation.z = roll;
      bodyStripe.rotation.x = 0.18;
      this.bodyCore.add(bodyStripe);
    }

    const neck = ellipsoid(this.pet, furWarm, new THREE.Vector3(0.56, 0.82, 0.08), new THREE.Vector3(0.24, 0.22, 0.2), 24);
    neck.rotation.z = -0.12;

    this.head.position.set(0.78, 0.97, 0.18);
    ellipsoid(this.head, furWarm, new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0.38, 0.32, 0.34), 44);
    ellipsoid(this.head, chest, new THREE.Vector3(-0.1, -0.08, 0.28), new THREE.Vector3(0.16, 0.12, 0.1), 24);
    ellipsoid(this.head, chest, new THREE.Vector3(0.1, -0.08, 0.28), new THREE.Vector3(0.16, 0.12, 0.1), 24);
    ellipsoid(this.head, chest, new THREE.Vector3(0, -0.16, 0.28), new THREE.Vector3(0.16, 0.09, 0.08), 20);

    for (const [x, roll] of [
      [-0.14, 0.28],
      [0, 0],
      [0.14, -0.28]
    ] as const) {
      const mark = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.16, 5, 8), stripe);
      mark.position.set(x, 0.2, 0.31);
      mark.rotation.z = roll;
      mark.rotation.x = 0.1;
      this.head.add(mark);
    }

    for (const x of [-0.28, 0.28]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.38, 4), fur);
      ear.position.set(x, 0.33, 0.02);
      ear.scale.z = 0.74;
      ear.rotation.z = x < 0 ? 0.32 : -0.32;
      ear.rotation.y = x < 0 ? -0.18 : 0.18;
      ear.castShadow = true;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.088, 0.24, 4), innerEar);
      inner.position.set(0, -0.015, 0.025);
      inner.scale.z = 0.55;
      ear.add(inner);
      this.ears.push(ear);
      this.head.add(ear);
    }

    for (const x of [-0.15, 0.15]) {
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.071, 20, 12), irisMat);
      iris.position.set(x, 0.035, 0.337);
      iris.scale.set(1, 1.12, 0.26);
      this.head.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 10), pupilMat);
      pupil.position.set(x, 0.035, 0.382);
      pupil.scale.set(0.7, 1.45, 0.22);
      this.eyes.push(pupil);
      this.head.add(pupil);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff7df' }));
      glint.position.set(x - 0.018, 0.058, 0.403);
      this.head.add(glint);
    }

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 10), noseMat);
    nose.position.set(0, -0.08, 0.41);
    nose.scale.set(1.05, 0.72, 0.56);
    this.head.add(nose);

    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const whisker = new THREE.Mesh(new THREE.BoxGeometry(0.34 - i * 0.035, 0.006, 0.006), whiskerMat);
        whisker.position.set(side * (0.26 + i * 0.015), -0.085 - i * 0.022, 0.405);
        whisker.rotation.z = side * (0.08 + i * 0.095);
        whisker.rotation.y = side * -0.05;
        this.head.add(whisker);
      }
    }
    this.pet.add(this.head);

    this.tail.position.set(-0.88, 0.62, -0.04);
    for (let i = 0; i < 8; i += 1) {
      const joint = new THREE.Group();
      const radius = 0.07 - i * 0.004;
      const segment = new THREE.Mesh(new THREE.CapsuleGeometry(radius, 0.18, 8, 14), i % 2 ? shade : fur);
      segment.position.set(-0.075, 0, 0);
      segment.rotation.z = Math.PI / 2;
      segment.castShadow = true;
      joint.position.set(-i * 0.112, i * 0.055, i % 2 ? 0.012 : -0.006);
      joint.userData.baseZ = 0.12 - i * 0.035;
      joint.add(segment);
      this.tailJoints.push(joint);
      this.tail.add(joint);
    }
    this.pet.add(this.tail);

    const createLeg = (base: THREE.Vector3, front: boolean, phase: number) => {
      const root = new THREE.Group();
      root.position.copy(base);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(front ? 0.058 : 0.066, front ? 0.32 : 0.35, 8, 14), shade);
      upper.position.set(0, -0.08, 0);
      upper.rotation.x = front ? -0.08 : 0.06;
      upper.castShadow = true;
      root.add(upper);

      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(front ? 0.045 : 0.052, front ? 0.28 : 0.3, 8, 14), shade);
      lower.position.set(front ? 0.025 : -0.02, -0.3, 0.012);
      lower.castShadow = true;
      root.add(lower);

      const paw = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), furWarm);
      paw.position.set(front ? 0.045 : -0.02, -0.48, 0.026);
      paw.scale.set(front ? 0.13 : 0.15, 0.055, 0.095);
      paw.castShadow = true;
      this.paws.push(paw);
      root.add(paw);

      this.legRigs.push({ root, lower, paw, base: base.clone(), phase, front });
      this.pet.add(root);
    };

    createLeg(new THREE.Vector3(0.5, 0.5, 0.28), true, 0);
    createLeg(new THREE.Vector3(0.58, 0.5, -0.26), true, Math.PI);
    createLeg(new THREE.Vector3(-0.58, 0.5, 0.26), false, Math.PI);
    createLeg(new THREE.Vector3(-0.48, 0.5, -0.28), false, 0);

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
