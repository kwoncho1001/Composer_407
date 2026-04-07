import { openDB, IDBPDatabase } from 'idb';
import { Note, Project, SyncLedger } from '../types';

const DB_NAME = 'composer-db';
const DB_VERSION = 3; // Incremented version
const STORE_METADATA = 'notes_metadata';
const STORE_CONTENTS = 'note_contents';
const STORE_EMBEDDINGS = 'note_embeddings';
const STORE_EDGES = 'edges';
const STORE_PROJECTS = 'projects';
const STORE_SYNC_LEDGERS = 'sync_ledgers';

let dbPromise: Promise<IDBPDatabase<any>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STORE_METADATA)) {
          db.createObjectStore(STORE_METADATA, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CONTENTS)) {
          db.createObjectStore(STORE_CONTENTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_EMBEDDINGS)) {
          db.createObjectStore(STORE_EMBEDDINGS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_EDGES)) {
          db.createObjectStore(STORE_EDGES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SYNC_LEDGERS)) {
          db.createObjectStore(STORE_SYNC_LEDGERS, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

// --- Projects ---
export const getAllProjects = async (): Promise<Project[]> => {
  const db = await initDB();
  return db.getAll(STORE_PROJECTS);
};

export const saveProject = async (project: Project) => {
  const db = await initDB();
  await db.put(STORE_PROJECTS, project);
};

export const deleteProject = async (id: string) => {
  const db = await initDB();
  await db.delete(STORE_PROJECTS, id);
};

// --- Sync Ledgers ---
export const getSyncLedger = async (projectId: string): Promise<SyncLedger | undefined> => {
  const db = await initDB();
  return db.get(STORE_SYNC_LEDGERS, projectId);
};

export const saveSyncLedger = async (ledger: SyncLedger) => {
  const db = await initDB();
  await db.put(STORE_SYNC_LEDGERS, ledger);
};

export const deleteSyncLedger = async (projectId: string) => {
  const db = await initDB();
  await db.delete(STORE_SYNC_LEDGERS, projectId);
};

// --- Notes ---
export const getAllNotes = async (): Promise<Note[]> => {
  const db = await initDB();
  const [metadata, contents, embeddings, edges] = await Promise.all([
    db.getAll(STORE_METADATA),
    db.getAll(STORE_CONTENTS),
    db.getAll(STORE_EMBEDDINGS),
    db.getAll(STORE_EDGES)
  ]);

  const activeMetadata = metadata.filter(meta => !meta.deleted);

  return activeMetadata.map(meta => {
    const content = contents.find(c => c.id === meta.id);
    const embedding = embeddings.find(e => e.id === meta.id);
    const noteEdges = edges.filter(e => e.sourceId === meta.id || e.targetId === meta.id);
    
    return {
      ...meta,
      ...content,
      ...embedding,
      parentNoteIds: noteEdges.filter(e => e.targetId === meta.id && e.type === 'parent').map(e => e.sourceId),
      childNoteIds: noteEdges.filter(e => e.sourceId === meta.id && e.type === 'child').map(e => e.targetId),
      relatedNoteIds: noteEdges.filter(e => e.sourceId === meta.id && e.type === 'related').map(e => e.targetId),
    } as Note;
  });
};

export const saveNote = async (note: Note) => {
  const db = await initDB();
  const tx = db.transaction([STORE_METADATA, STORE_CONTENTS, STORE_EMBEDDINGS, STORE_EDGES], 'readwrite');
  
  const { parentNoteIds, childNoteIds, relatedNoteIds, ...metadata } = note;
  const content = { id: note.id, body: note.body, components: note.components, flow: note.flow, io: note.io };
  const embedding = { id: note.id, embedding: note.embedding, embeddingHash: note.embeddingHash, embeddingModel: note.embeddingModel, lastEmbeddedAt: note.lastEmbeddedAt };

  await Promise.all([
    tx.objectStore(STORE_METADATA).put({ ...metadata, isDirty: true }),
    tx.objectStore(STORE_CONTENTS).put(content),
    tx.objectStore(STORE_EMBEDDINGS).put(embedding),
    // Edges are handled separately or in a more complex way, for now just put metadata
  ]);
  await tx.done;
};

export const deleteNote = async (id: string) => {
  const db = await initDB();
  const tx = db.transaction([STORE_METADATA], 'readwrite');
  const metadataStore = tx.objectStore(STORE_METADATA);
  const metadata = await metadataStore.get(id);
  if (metadata) {
    await metadataStore.put({ ...metadata, deleted: true, isDirty: true });
  }
  await tx.done;
};

export const bulkSaveNotes = async (notes: Note[]) => {
  const db = await initDB();
  const tx = db.transaction([STORE_METADATA, STORE_CONTENTS, STORE_EMBEDDINGS, STORE_EDGES], 'readwrite');
  await Promise.all(notes.map(note => {
    const { parentNoteIds, childNoteIds, relatedNoteIds, ...metadata } = note;
    const content = { id: note.id, body: note.body, components: note.components, flow: note.flow, io: note.io };
    const embedding = { id: note.id, embedding: note.embedding, embeddingHash: note.embeddingHash, embeddingModel: note.embeddingModel, lastEmbeddedAt: note.lastEmbeddedAt };
    return Promise.all([
      tx.objectStore(STORE_METADATA).put({ ...metadata, isDirty: true }),
      tx.objectStore(STORE_CONTENTS).put(content),
      tx.objectStore(STORE_EMBEDDINGS).put(embedding),
    ]);
  }));
  await tx.done;
};

export const bulkDeleteNotes = async (ids: string[]) => {
  const db = await initDB();
  const tx = db.transaction([STORE_METADATA], 'readwrite');
  const metadataStore = tx.objectStore(STORE_METADATA);
  await Promise.all(ids.map(async id => {
    const metadata = await metadataStore.get(id);
    if (metadata) {
      await metadataStore.put({ ...metadata, deleted: true, isDirty: true });
    }
  }));
  await tx.done;
};

export const getDirtyNotes = async (): Promise<Note[]> => {
  const db = await initDB();
  const [metadata, contents, embeddings, edges] = await Promise.all([
    db.getAll(STORE_METADATA),
    db.getAll(STORE_CONTENTS),
    db.getAll(STORE_EMBEDDINGS),
    db.getAll(STORE_EDGES)
  ]);

  const dirtyMetadata = metadata.filter(meta => meta.isDirty);

  return dirtyMetadata.map(meta => {
    const content = contents.find(c => c.id === meta.id);
    const embedding = embeddings.find(e => e.id === meta.id);
    const noteEdges = edges.filter(e => e.sourceId === meta.id || e.targetId === meta.id);
    
    return {
      ...meta,
      ...content,
      ...embedding,
      parentNoteIds: noteEdges.filter(e => e.targetId === meta.id && e.type === 'parent').map(e => e.sourceId),
      childNoteIds: noteEdges.filter(e => e.sourceId === meta.id && e.type === 'child').map(e => e.targetId),
      relatedNoteIds: noteEdges.filter(e => e.sourceId === meta.id && e.type === 'related').map(e => e.targetId),
    } as Note;
  });
};

export const markNotesClean = async (ids: string[]) => {
  const db = await initDB();
  const tx = db.transaction([STORE_METADATA, STORE_CONTENTS, STORE_EMBEDDINGS], 'readwrite');
  const metadataStore = tx.objectStore(STORE_METADATA);
  const contentsStore = tx.objectStore(STORE_CONTENTS);
  const embeddingsStore = tx.objectStore(STORE_EMBEDDINGS);
  
  await Promise.all(ids.map(async id => {
    const metadata = await metadataStore.get(id);
    if (metadata) {
      if (metadata.deleted) {
        // If it was deleted and now synced, we can permanently delete it from local DB
        await metadataStore.delete(id);
        await contentsStore.delete(id);
        await embeddingsStore.delete(id);
      } else {
        await metadataStore.put({ ...metadata, isDirty: false });
      }
    }
  }));
  await tx.done;
};
