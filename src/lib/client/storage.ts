"use client";

import { useSyncExternalStore } from "react";
import sampleProject from "@/data/sample-project.json";
import type { Project } from "../types";

const PROJECTS_KEY = "strategy-agent:projects:v1";
const SEEDED_KEY = "strategy-agent:sample-seeded:v1";
const EMPTY: Project[] = [];

export const SAMPLE_PROJECT = sampleProject as unknown as Project;

let cache: Project[] | null = null;
const listeners = new Set<() => void>();

export class StorageFullError extends Error {
  constructor() {
    super("Browser storage is full. Delete an old project or remove large PDFs and try again.");
  }
}

function load(): Project[] {
  if (cache) return cache;
  let projects: Project[] = [];
  try {
    projects = JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "[]") as Project[];
    if (!Array.isArray(projects)) projects = [];
  } catch {
    projects = [];
  }
  try {
    if (!localStorage.getItem(SEEDED_KEY) && SAMPLE_PROJECT?.id && !projects.some((p) => p.id === SAMPLE_PROJECT.id)) {
      projects = [...projects, SAMPLE_PROJECT];
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      localStorage.setItem(SEEDED_KEY, "1");
    }
  } catch {
    // Storage unavailable (private mode): the sample still shows for this session.
    if (!projects.some((p) => p.id === SAMPLE_PROJECT.id)) projects = [...projects, SAMPLE_PROJECT];
  }
  cache = projects;
  return cache;
}

function persist(projects: Project[]) {
  cache = projects;
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22)) {
      listeners.forEach((l) => l());
      throw new StorageFullError();
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === PROJECTS_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useProjects(): Project[] {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

/** False during server render and hydration; true once browser storage has been read. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function getProject(id: string): Project | undefined {
  return load().find((p) => p.id === id);
}

export function saveProject(project: Project) {
  const projects = load();
  const next = { ...project, updatedAt: new Date().toISOString() };
  const index = projects.findIndex((p) => p.id === project.id);
  persist(index === -1 ? [next, ...projects] : projects.map((p, i) => (i === index ? next : p)));
}

export function updateProject(id: string, update: (project: Project) => Project) {
  const current = getProject(id);
  if (current) saveProject(update(current));
}

export async function deleteProject(id: string) {
  const project = getProject(id);
  persist(load().filter((p) => p.id !== id));
  if (project?.brief.files.length) await deleteFiles(project.brief.files.map((f) => f.id)).catch(() => {});
}

export function restoreSample() {
  if (!getProject(SAMPLE_PROJECT.id)) persist([...load(), SAMPLE_PROJECT]);
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------- PDF files (IndexedDB: too large for localStorage) ----------------

const DB_NAME = "strategy-agent";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open file storage"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request ? request.result : undefined);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("File storage error"));
    };
  });
}

export function putFile(id: string, file: Blob) {
  return withStore("readwrite", (store) => store.put(file, id));
}

export function getFile(id: string) {
  return withStore<Blob | undefined>("readonly", (store) => store.get(id) as IDBRequest<Blob | undefined>);
}

export function deleteFiles(ids: string[]) {
  return withStore("readwrite", (store) => {
    ids.forEach((id) => store.delete(id));
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}
