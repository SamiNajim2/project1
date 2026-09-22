"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../project";

// Projects live in IndexedDB: raw spreadsheets are often too large for localStorage.
const DB_NAME = "finance-analyst";
const STORE = "projects";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Browser storage is unavailable"));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req ? req.result : undefined);
    };
    t.onerror = () => {
      db.close();
      reject(t.error ?? new Error("Browser storage error"));
    };
    t.onabort = () => {
      db.close();
      reject(t.error ?? new Error("Browser storage is full"));
    };
  });
}

export const listProjects = async () => ((await tx<Project[]>("readonly", (s) => s.getAll() as IDBRequest<Project[]>)) ?? []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
export const getProject = (id: string) => tx<Project | undefined>("readonly", (s) => s.get(id) as IDBRequest<Project | undefined>);
export const putProject = (p: Project) => tx("readwrite", (s) => s.put(p));
export const deleteProject = (id: string) => tx("readwrite", (s) => s.delete(id));

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Loads one project and saves every change back (debounced). */
export function useProject(id: string) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Project | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    getProject(id)
      .then((p) => alive && setProject(p ?? null))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not open browser storage"));
    return () => {
      alive = false;
    };
  }, [id]);

  const flush = useCallback(async () => {
    if (!pending.current) return;
    const p = pending.current;
    pending.current = null;
    setSaveState("saving");
    try {
      await putProject(p);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }, []);

  const update = useCallback(
    (fn: (p: Project) => Project) => {
      setProject((prev) => {
        if (!prev) return prev;
        const next = { ...fn(prev), updatedAt: new Date().toISOString() };
        pending.current = next;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 400);
        return next;
      });
    },
    [flush],
  );

  useEffect(() => () => void flush(), [flush]);

  return { project, update, saveState, error };
}
