export class DisjointSet {
    constructor() {
        this.parent = new Map();
    }

    make(x) {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
        }
    }

    find(x) {
        this.make(x);
        let p = this.parent.get(x);
        while (p !== this.parent.get(p)) {
            p = this.parent.get(p);
        }
        let cur = x;
        while (cur !== p) {
            const next = this.parent.get(cur);
            this.parent.set(cur, p);
            cur = next;
        }
        return p;
    }

    union(a, b) {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra !== rb) {
            this.parent.set(ra, rb);
        }
    }
}
