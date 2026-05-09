export class DisjointSet {
    constructor() {
        this.parent = new Map();
        this.rank = new Map();
    }

    make(x) {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
            this.rank.set(x, 0);
        }
    }

    find(x) {
        this.make(x);
        if (this.parent.get(x) !== x) {
            this.parent.set(x, this.find(this.parent.get(x)));
        }
        return this.parent.get(x);
    }

    union(a, b) {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra === rb) {
            return;
        }
        const rwa = this.rank.get(ra) || 0;
        const rwb = this.rank.get(rb) || 0;
        if (rwa < rwb) {
            this.parent.set(ra, rb);
        } else if (rwa > rwb) {
            this.parent.set(rb, ra);
        } else {
            this.parent.set(rb, ra);
            this.rank.set(ra, rwa + 1);
        }
    }
}
