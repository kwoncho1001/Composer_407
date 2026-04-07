import { openDB, IDBPDatabase } from 'idb';
import { Note } from '../types';

const DB_NAME = 'composer-db';
const DB_VERSION = 2; // Incremented version
const STORE_METADATA = 'notes_metadata';
const STORE_CONTENTS = 'note_contents';
const STORE_EMBEDDINGS = 'note_embeddings';
const STORE_EDGES = 'edges';

let dbPromise: Promise<IDBPDatabase<any>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
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
      },
    });
  }
  return dbPromise;
};

export const getAllNotes = async (): Promise<Note[]> => {
  const db = await initDB();
  const [metadata, contents, embeddings, edges] = await Promise.all([
    db.getAll(STORE_METADATA),
    db.getAll(STORE_CONTENTS),
    db.getAll(STORE_EMBEDDINGS),
    db.getAll(STORE_EDGES)
  ]);

  return metadata.map(meta => {
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
  const tx = db.transaction([STORE_METADATA, STORE_CONTENTS, STORE_EMBEDDINGS, STORE_EDGES], 'readwrite');
  await Promise.all([
    tx.objectStore(STORE_METADATA).delete(id),
    tx.objectStore(STORE_CONTENTS).delete(id),
    tx.objectStore(STORE_EMBEDDINGS).delete(id),
  ]);
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
  const tx = db.transaction([STORE_METADATA, STORE_CONTENTS, STORE_EMBEDDINGS, STORE_EDGES], 'readwrite');
  await Promise.all(ids.map(id => Promise.all([
    tx.objectStore(STORE_METADATA).delete(id),
    tx.objectStore(STORE_CONTENTS).delete(id),
    tx.objectStore(STORE_EMBEDDINGS).delete(id),
  ])));
  await tx.done;
};
