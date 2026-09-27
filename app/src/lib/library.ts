export interface LibraryItem {
  id: string;
  prefix: string;
  number: string;
  title: string;
  svg: string;
  svgMirror: string;
  viewCaption: string | null;
  contacts: number;
}

export interface LibraryFamily {
  id: string;
  title: string;
  items: LibraryItem[];
}

export interface LibraryIndex {
  schemaVersion: number;
  libraryVersion: string;
  builtAt: string;
  families: LibraryFamily[];
}

function numberCompare(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

/** Sort items defensively even though the build pipeline pre-sorts them. */
function sortItems(items: LibraryItem[]): LibraryItem[] {
  return [...items].sort((a, b) => {
    const p = a.prefix.localeCompare(b.prefix);
    if (p !== 0) return p;
    return numberCompare(a.number, b.number);
  });
}

export function libraryUrl(path: string): string {
  return `${import.meta.env.BASE_URL}library/${path}`;
}

export async function fetchLibraryIndex(): Promise<LibraryIndex> {
  const res = await fetch(libraryUrl('index.json'), { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Failed to load library index.json: ${res.status}`);
  }
  const data = (await res.json()) as LibraryIndex;
  data.families = [...data.families].sort((a, b) => a.id.localeCompare(b.id));
  for (const family of data.families) {
    family.items = sortItems(family.items);
  }
  return data;
}

export function lettersOf(family: LibraryFamily): string[] {
  const set = new Set(family.items.map((i) => i.prefix));
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function numbersOf(family: LibraryFamily, letter: string): LibraryItem[] {
  return family.items
    .filter((i) => i.prefix === letter)
    .sort((a, b) => numberCompare(a.number, b.number));
}

export function findItem(
  family: LibraryFamily | undefined,
  itemId: string,
): LibraryItem | undefined {
  return family?.items.find((i) => i.id === itemId);
}
