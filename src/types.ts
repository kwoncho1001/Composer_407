export type NoteType = 'Domain' | 'Module' | 'Logic' | 'Snapshot';
export type NoteStatus = 'Planned' | 'Done' | 'Conflict';
export type NotePriority = 'P1' | 'P2' | 'P3' | 'A' | 'B' | 'C' | 'Done';
export type LensType = 'Feature' | 'Snapshot';

export interface ConflictDetail {
  aspect: string;
  design: string;
  code: string;
  impact: string;
}

export interface ConflictDetails {
  summary: string;
  differences: ConflictDetail[];
}

export interface Project {
  id: string;
  name: string;
  repoUrl: string;
  uid: string;
  createdAt: any; // Firestore Timestamp
}

export interface CSuiteEvaluation {
  cto: string;
  cmo: string;
  cfo: string;
  consensus: string;
}

export interface CostEstimate {
  totalMonthlyCost: string;
  infrastructure: string;
  thirdPartyApis: string;
  maintenance: string;
  summary: string;
}

export interface PitchDeck {
  pressRelease: string;
  elevatorPitch: string;
  problemAndSolution: string;
  targetAudience: string;
  businessModel: string;
}

export interface CompetitorAnalysis {
  coreMechanics: string;
  weaknesses: string;
  blueOceanStrategy: string;
  actionableLogics: string[];
}

export interface ProactiveNudge {
  id: string;
  nudgeType: string;
  track: 'Involution' | 'Evolution';
  context: string;
  question: string;
  hypothesis: string;
  actionPrompt: string;
}

export interface NoteMetadata {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  folder: string;
  noteType: NoteType;
  status: NoteStatus;
  priority: NotePriority;
  lastUpdated: any;
  uid: string;
  createdAt: any;
  isDirty?: boolean; // For local-first sync
}

export interface NoteContent {
  id: string;
  body: string;
  components?: string;
  flow?: string;
  io?: string;
}

export interface NoteEmbedding {
  id: string;
  embedding: number[];
  embeddingHash?: string;
  embeddingModel?: string;
  lastEmbeddedAt?: any;
}

export interface Edge {
  id: string;
  projectId: string;
  sourceId: string;
  targetId: string;
  type: 'parent' | 'child' | 'related';
}

export interface Note extends NoteMetadata {
  body?: string;
  components?: string;
  flow?: string;
  io?: string;
  embedding?: number[];
  embeddingHash?: string;
  embeddingModel?: string;
  lastEmbeddedAt?: any;
  parentNoteIds: string[];
  childNoteIds: string[];
  relatedNoteIds: string[];
  originPath?: string;
  sha?: string;
  contentHash?: string;
  lens?: LensType;
  conflictDetails?: ConflictDetails;
}

export interface SyncLedger {
  id: string;
  projectId: string;
  repoUrl: string;
  fileShaMap: Record<string, string>;
  lastSyncedAt: any; // Firestore Timestamp
  uid: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
