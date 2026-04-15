/**
 * GraphAdapter Interface
 * 
 * Defines the contract for any graph matchmaking algorithm used by the Barter Engine.
 * This guarantees Option A (Node In-Memory) can easily swap to Option B (Neo4j).
 */
class GraphAdapter {
    /**
     * @param {Array} items - List of available barter_items
     * @param {Number} maxDepth - Maximum depth for circular match loops (e.g. 4)
     * @returns {Array} List of matched loops (arrays of items forming a cycle)
     */
    findCircularMatches(items, maxDepth) {
        throw new Error("Method 'findCircularMatches()' must be implemented by adapter");
    }
}

module.exports = GraphAdapter;
