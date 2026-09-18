export type Tag = { id: string; name: string; parent?: string }
export type Catalog = { version: number; revision: number; tags: Tag[]; images: Record<string, string[]> }
export type Boot = { document: Catalog; files: string[]; folder: string; dataDir: string; context: string; dates: Record<string, { modified: number; created: number }> }
export const imageUrl = (file: string, context: string) => `/images/${encodeURIComponent(file)}?context=${encodeURIComponent(context)}`
export function hasTag(tags: string[], id: string, all: Tag[]) {
  return tags.includes(id) || tags.some(child => all.find(t => t.id === child)?.parent === id)
}





