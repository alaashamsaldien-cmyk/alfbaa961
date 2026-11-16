export type AssignmentMode = "shared" | "separate";
export type AssignmentAction = "add" | "replace" | "remove";

/** Stable round-robin allocation; preview and commit use the same ordered inputs. */
export function assignmentPlan(schoolIds: string[], coordinatorIds: string[], mode: AssignmentMode) {
  const schools = [...new Set(schoolIds)];
  const people = [...new Set(coordinatorIds)];
  if (!schools.length || !people.length) throw new Error("حدد المدارس والمنسّقين.");
  return schools.map((schoolId, index) => ({
    schoolId,
    coordinatorIds: mode === "shared" ? people : [people[index % people.length]],
  }));
}

export function resultingAssignees(current: string[], selected: string[], action: AssignmentAction) {
  if (action === "replace") return [...new Set(selected)];
  if (action === "remove") return current.filter((id) => !selected.includes(id));
  return [...new Set([...current, ...selected])];
}
