import type { PetBehavior } from './types';

export interface MotionInput {
  behavior: PetBehavior;
  act: 1 | 2 | 3;
  time: number;
  velocity: number;
  attention: number;
}

export interface MotionPose {
  bodyY: number;
  bodyRoll: number;
  bodyPitch: number;
  bodySquashX: number;
  bodySquashY: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  earLeft: number;
  earRight: number;
  tailYaw: number;
  tailLift: number;
  tailCurl: number;
  pawLift: number[];
  eyeOpen: number;
  pupilScale: number;
}

function wave(time: number, speed: number, phase = 0) {
  return Math.sin(time * speed + phase);
}

function pulse01(time: number, speed: number, phase = 0) {
  return Math.max(0, wave(time, speed, phase));
}

export class MochiMotion {
  sample(input: MotionInput): MotionPose {
    const wrongness = input.act === 1 ? 0 : input.act === 2 ? 0.35 : 0.75;
    const breathe = wave(input.time, 1.55 + wrongness * 0.4);
    const gait = Math.max(input.velocity, input.behavior === 'play' ? 0.9 : input.behavior === 'approach' ? 0.55 : 0);
    const gaitSpeed = 7.2 + wrongness * 2.5;

    const pose: MotionPose = {
      bodyY: breathe * 0.028 + gait * pulse01(input.time, gaitSpeed) * 0.055,
      bodyRoll: wave(input.time, 1.1) * 0.025,
      bodyPitch: 0,
      bodySquashX: 1,
      bodySquashY: 1 + breathe * 0.025,
      headPitch: wave(input.time, 1.35) * 0.035,
      headYaw: wave(input.time, 0.75) * 0.05,
      headRoll: wave(input.time, 1.2) * 0.035,
      earLeft: wave(input.time, 3.1) * 0.035,
      earRight: wave(input.time, 2.7, 1.4) * 0.035,
      tailYaw: wave(input.time, 2.2) * 0.16,
      tailLift: wave(input.time, 1.4) * 0.09,
      tailCurl: wave(input.time, 2.6) * 0.2,
      pawLift: [0, 0, 0, 0],
      eyeOpen: wave(input.time, 2.8) > 0.96 ? 0.08 : 1,
      pupilScale: 1 + wrongness * 0.18
    };

    if (gait > 0) {
      pose.bodyRoll += wave(input.time, gaitSpeed) * 0.04 * gait;
      pose.bodyPitch += wave(input.time, gaitSpeed * 0.5) * 0.035 * gait;
      pose.pawLift = [0, Math.PI, Math.PI, 0].map((phase) => pulse01(input.time, gaitSpeed, phase) * 0.11 * gait);
      pose.tailYaw += wave(input.time, gaitSpeed * 0.55) * 0.18 * gait;
    }

    if (input.behavior === 'eat') {
      pose.headPitch = 0.28 + wave(input.time, 9) * 0.12;
      pose.bodyPitch = -0.05;
      pose.eyeOpen = 0.82;
    }

    if (input.behavior === 'sleep') {
      pose.bodySquashX = 1.12;
      pose.bodySquashY = 0.84;
      pose.bodyY = wave(input.time, 0.7) * 0.012;
      pose.headPitch = 0.42;
      pose.tailYaw = wave(input.time, 0.55) * 0.06;
      pose.eyeOpen = 0.07;
    }

    if (input.behavior === 'stare' || input.behavior === 'follow') {
      pose.headYaw = wave(input.time, 0.34) * 0.025;
      pose.headRoll = wave(input.time, 0.47) * 0.06 * (1 + wrongness);
      pose.tailYaw = wave(input.time, 7.4) * 0.08 * wrongness;
      pose.eyeOpen = 1.15;
      pose.pupilScale = 1.18 + wrongness * 0.35;
    }

    if (input.behavior === 'refuse') {
      pose.headYaw = -0.35;
      pose.headPitch = -0.08;
      pose.tailLift = -0.16;
      pose.earLeft -= 0.16;
      pose.earRight += 0.16;
    }

    if (input.act === 3) {
      const twitch = Math.sign(wave(input.time, 18.5)) * Math.max(0, wave(input.time, 4.1));
      pose.headRoll += twitch * 0.035;
      pose.tailCurl += twitch * 0.18;
    }

    return pose;
  }
}
