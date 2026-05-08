import { buildNgspiceDeckV2 } from "./v2/index.js";

export function buildNgspiceDeck(state, options = {}) {
    return buildNgspiceDeckV2(state, options);
}
