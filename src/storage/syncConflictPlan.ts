/** ধাপ ৫ - কনফ্লিক্ট সরানোর খাঁটি পরিকল্পনা (IO নেই, টেস্ট করা যায়) */

export interface ConflictMovePlan {
  /** সত্যিই সরানো হবে - conflicts[] এর সূচক, গভীরতা অনুযায়ী (ওপরের ফোল্ডার আগে) */
  order: number[];
  /** আগে সরা অন্য কনফ্লিক্টের ভেতরে পড়ে, তাই আলাদা সরানো লাগে না - সূচক -> যে সূচকের ভেতরে */
  covered: Map<number, number>;
}

const isInside = (child: string, parent: string) => child === parent || child.startsWith(parent + '/');

/** খাঁটি: কোনটা আগে সরবে, কোনটা আরেকটার ভেতরে থাকায় সঙ্গে চলে যাবে */
export function planConflictMoves(conflicts: Pick<ConflictEntry, 'scope' | 'sourcePath'>[]): ConflictMovePlan {
  const idx = conflicts.map((_, i) => i).sort((a, b) => {
    const da = conflicts[a].sourcePath.split('/').length;
    const db = conflicts[b].sourcePath.split('/').length;
    return da - db || a - b;
  });
  const order: number[] = [];
  const covered = new Map<number, number>();
  for (const i of idx) {
    const c = conflicts[i];
    const owner = order.find((j) => conflicts[j].scope === c.scope && isInside(c.sourcePath, conflicts[j].sourcePath));
    if (owner !== undefined) covered.set(i, owner);
    else order.push(i);
  }
  return { order, covered };
}

