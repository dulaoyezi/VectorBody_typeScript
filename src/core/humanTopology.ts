import type { Landmarks, Point } from "./types";
import { midpoint, norm, sub } from "./math";
export interface Bone { parent: string; child: string; vector: Point; length: number; unit: Point }
export interface TopologyFrame { nodes: Record<string, Point>; bones: Record<string, Bone> }
export const ROOT = "pelvis_center";
export const RAW_LANDMARKS: Record<string, number> = {
  nose: 0, left_ear: 7, right_ear: 8,
  left_shoulder: 11, right_shoulder: 12, left_elbow: 13, right_elbow: 14,
  left_wrist: 15, right_wrist: 16, left_hip: 23, right_hip: 24,
  left_knee: 25, right_knee: 26, left_ankle: 27, right_ankle: 28,
  left_heel: 29, right_heel: 30, left_foot_index: 31, right_foot_index: 32
};
export const EDGES: [string, string][] = [
  ["pelvis_center", "shoulder_center"], ["shoulder_center", "head_center"],
  ["head_center", "nose"], ["head_center", "left_ear"], ["head_center", "right_ear"],
  ["shoulder_center", "left_shoulder"], ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["shoulder_center", "right_shoulder"], ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["pelvis_center", "left_hip"], ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["left_ankle", "left_heel"], ["left_ankle", "left_foot_index"],
  ["pelvis_center", "right_hip"], ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
  ["right_ankle", "right_heel"], ["right_ankle", "right_foot_index"]
];
export const CHAINS: Record<string, string[]> = {
  trunk: ["pelvis_center", "shoulder_center", "head_center"],
  left_arm: ["shoulder_center", "left_shoulder", "left_elbow", "left_wrist"],
  right_arm: ["shoulder_center", "right_shoulder", "right_elbow", "right_wrist"],
  left_leg: ["pelvis_center", "left_hip", "left_knee", "left_ankle", "left_foot_index"],
  right_leg: ["pelvis_center", "right_hip", "right_knee", "right_ankle", "right_foot_index"]
};
export const edgeKey = (a: string, b: string) => a + "|" + b;
export function buildTopology(landmarks: Landmarks): TopologyFrame {
  if (landmarks.length < 33) throw new Error("需要完整的 33 个人体关键点");
  const nodes: Record<string, Point> = {};
  for (const [name, index] of Object.entries(RAW_LANDMARKS)) nodes[name] = [...landmarks[index]] as Point;
  nodes.pelvis_center = midpoint(nodes.left_hip, nodes.right_hip);
  nodes.shoulder_center = midpoint(nodes.left_shoulder, nodes.right_shoulder);
  nodes.head_center = midpoint(nodes.left_ear, nodes.right_ear);
  nodes.trunk_center = midpoint(nodes.pelvis_center, nodes.shoulder_center);
  const bones: Record<string, Bone> = {};
  for (const [parent, child] of EDGES) {
    const vector = sub(nodes[child], nodes[parent]);
    const length = norm(vector);
    bones[edgeKey(parent, child)] = { parent, child, vector, length, unit: vector.map(v => v / (length + 1e-6)) as Point };
  }
  return { nodes, bones };
}
export const boneLength = (frame: TopologyFrame, a: string, b: string) => frame.bones[edgeKey(a, b)].length;
