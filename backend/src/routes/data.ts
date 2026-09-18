import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { getData, mutate } from "../store.js";
import { Due, FilterDef, Label, Priority, Project, Section, Task } from "../types.js";

const router = Router();

function nextOrder(items: { order: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.order), -1) + 1;
}

// ---- bootstrap ----
router.get("/bootstrap", async (_req, res) => {
  const data = await getData();
  res.json(data);
});

// ---- projects ----
router.post("/projects", async (req: Request, res: Response) => {
  const { name, color = "grey", parentId = null } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const project = await mutate((data) => {
    const p: Project = {
      id: nanoid(),
      name,
      color,
      order: nextOrder(data.projects),
      isFavorite: false,
      parentId,
    };
    data.projects.push(p);
    return p;
  });
  res.status(201).json(project);
});

router.patch("/projects/:id", async (req: Request, res: Response) => {
  const updated = await mutate((data) => {
    const p = data.projects.find((x) => x.id === req.params.id);
    if (!p) return null;
    Object.assign(p, req.body);
    return p;
  });
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});

router.delete("/projects/:id", async (req: Request, res: Response) => {
  await mutate((data) => {
    data.projects = data.projects.filter((p) => p.id !== req.params.id && !p.isInboxProject);
    data.sections = data.sections.filter((s) => s.projectId !== req.params.id);
    data.tasks = data.tasks.filter((t) => t.projectId !== req.params.id);
  });
  res.status(204).end();
});

// ---- sections ----
router.post("/sections", async (req: Request, res: Response) => {
  const { name, projectId } = req.body || {};
  if (!name || !projectId) return res.status(400).json({ error: "name and projectId are required" });
  const section = await mutate((data) => {
    const s: Section = {
      id: nanoid(),
      projectId,
      name,
      order: nextOrder(data.sections.filter((x) => x.projectId === projectId)),
    };
    data.sections.push(s);
    return s;
  });
  res.status(201).json(section);
});

router.patch("/sections/:id", async (req: Request, res: Response) => {
  const updated = await mutate((data) => {
    const s = data.sections.find((x) => x.id === req.params.id);
    if (!s) return null;
    Object.assign(s, req.body);
    return s;
  });
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});

router.delete("/sections/:id", async (req: Request, res: Response) => {
  await mutate((data) => {
    data.sections = data.sections.filter((s) => s.id !== req.params.id);
    data.tasks.forEach((t) => {
      if (t.sectionId === req.params.id) t.sectionId = null;
    });
  });
  res.status(204).end();
});

// ---- labels ----
router.post("/labels", async (req: Request, res: Response) => {
  const { name, color = "grey" } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const label = await mutate((data) => {
    const l: Label = {
      id: nanoid(),
      name,
      color,
      order: nextOrder(data.labels),
      isFavorite: false,
    };
    data.labels.push(l);
    return l;
  });
  res.status(201).json(label);
});

router.patch("/labels/:id", async (req: Request, res: Response) => {
  const updated = await mutate((data) => {
    const l = data.labels.find((x) => x.id === req.params.id);
    if (!l) return null;
    const oldName = l.name;
    Object.assign(l, req.body);
    if (req.body.name && req.body.name !== oldName) {
      data.tasks.forEach((t) => {
        t.labels = t.labels.map((n) => (n === oldName ? l.name : n));
      });
    }
    return l;
  });
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});

router.delete("/labels/:id", async (req: Request, res: Response) => {
  await mutate((data) => {
    const label = data.labels.find((l) => l.id === req.params.id);
    data.labels = data.labels.filter((l) => l.id !== req.params.id);
    if (label) {
      data.tasks.forEach((t) => {
        t.labels = t.labels.filter((n) => n !== label.name);
      });
    }
  });
  res.status(204).end();
});

// ---- filters ----
router.post("/filters", async (req: Request, res: Response) => {
  const { name, query, color = "grey" } = req.body || {};
  if (!name || !query) return res.status(400).json({ error: "name and query are required" });
  const filter = await mutate((data) => {
    const f: FilterDef = {
      id: nanoid(),
      name,
      query,
      color,
      order: nextOrder(data.filters),
      isFavorite: false,
    };
    data.filters.push(f);
    return f;
  });
  res.status(201).json(filter);
});

router.patch("/filters/:id", async (req: Request, res: Response) => {
  const updated = await mutate((data) => {
    const f = data.filters.find((x) => x.id === req.params.id);
    if (!f) return null;
    Object.assign(f, req.body);
    return f;
  });
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});

router.delete("/filters/:id", async (req: Request, res: Response) => {
  await mutate((data) => {
    data.filters = data.filters.filter((f) => f.id !== req.params.id);
  });
  res.status(204).end();
});

// ---- tasks ----
router.post("/tasks", async (req: Request, res: Response) => {
  const {
    content,
    description = "",
    projectId = "inbox",
    sectionId = null,
    parentId = null,
    priority = 1,
    due = null,
    labels = [],
  } = req.body || {};
  if (!content) return res.status(400).json({ error: "content is required" });
  const now = new Date().toISOString();
  const task = await mutate((data) => {
    const siblings = data.tasks.filter(
      (t) => t.projectId === projectId && t.sectionId === sectionId && t.parentId === parentId
    );
    const t: Task = {
      id: nanoid(),
      content,
      description,
      projectId,
      sectionId,
      parentId,
      order: nextOrder(siblings),
      priority: priority as Priority,
      due: due as Due | null,
      labels,
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    data.tasks.push(t);
    return t;
  });
  res.status(201).json(task);
});

router.patch("/tasks/:id", async (req: Request, res: Response) => {
  const updated = await mutate((data) => {
    const t = data.tasks.find((x) => x.id === req.params.id);
    if (!t) return null;
    Object.assign(t, req.body, { updatedAt: new Date().toISOString() });
    return t;
  });
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});

router.post("/tasks/:id/complete", async (req: Request, res: Response) => {
  const updated = await mutate((data) => {
    const t = data.tasks.find((x) => x.id === req.params.id);
    if (!t) return null;
    t.completed = true;
    t.completedAt = new Date().toISOString();
    return t;
  });
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});

router.post("/tasks/:id/uncomplete", async (req: Request, res: Response) => {
  const updated = await mutate((data) => {
    const t = data.tasks.find((x) => x.id === req.params.id);
    if (!t) return null;
    t.completed = false;
    t.completedAt = null;
    return t;
  });
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});

router.delete("/tasks/:id", async (req: Request, res: Response) => {
  await mutate((data) => {
    const idsToDelete = new Set([req.params.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of data.tasks) {
        if (t.parentId && idsToDelete.has(t.parentId) && !idsToDelete.has(t.id)) {
          idsToDelete.add(t.id);
          changed = true;
        }
      }
    }
    data.tasks = data.tasks.filter((t) => !idsToDelete.has(t.id));
  });
  res.status(204).end();
});

export default router;
