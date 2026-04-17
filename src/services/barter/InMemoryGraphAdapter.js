const GraphAdapter = require('./GraphAdapter');

/**
 * InMemoryGraphAdapter (Option A)
 * Executes circular matching algorithms natively in Node.js logic.
 */
class InMemoryGraphAdapter extends GraphAdapter {
    /**
     * Executes DFS to find closed loops of barter exchanges up to maxDepth.
     * Items array format: [{ id: 1, user_id: 10, item_name: 'phone', want_category: 'laptop' }]
     */
    findCircularMatches(items, maxDepth = 4) {
        console.log(`[BarterEngine] 🔄 InMemoryGraphAdapter finding loops amongst ${items.length} active items...`);
        
        // 1. Build Adjacency Matrix
        // A directed edge exists from Item A to Item B if User A's `want_category` matches User B's `item_name` or category.
        // For simplicity in this engine, we do a basic keyword match or category match.
        const adjMap = new Map();
        
        for (const fromItem of items) {
            adjMap.set(fromItem.id, []);
            for (const toItem of items) {
                // Cannot trade with yourself
                if (fromItem.user_id === toItem.user_id) continue;
                
                // 2. Determine Match:
                // We have a match if User A's `want_category` matches User B's core `category` OR `item_name`.
                const fromWants = fromItem.want_category.toLowerCase();
                const toHasCategory = (toItem.category || 'other').toLowerCase();
                const toHasName = toItem.item_name.toLowerCase();

                const isDirectCategoryMatch = toHasCategory === fromWants;
                const isFuzzyNameMatch = toHasName.includes(fromWants);

                if (isDirectCategoryMatch || isFuzzyNameMatch) {
                    adjMap.get(fromItem.id).push(toItem);
                }
            }
        }

        // 2. Depth-First Search for Circular Loops
        const matchedLoops = [];
        const visited = new Set();
        
        // Helper recursive DFS
        const dfs = (startItem, currentItem, path, depth) => {
            if (depth > maxDepth) return;
            
            const neighbors = adjMap.get(currentItem.id) || [];
            
            for (const neighbor of neighbors) {
                // If we circle back to the start item, we formed a valid loop!
                if (neighbor.id === startItem.id && path.length >= 2) {
                    matchedLoops.push([...path]);
                    return;
                }
                
                // Prevent returning to an already visited node in this current path 
                if (!path.some(p => p.id === neighbor.id)) {
                    dfs(startItem, neighbor, [...path, neighbor], depth + 1);
                }
            }
        };

        // 3. Kickoff DFS for each node
        for (const item of items) {
            if (!visited.has(item.id)) {
                dfs(item, item, [item], 1);
                // We add to visited to prevent finding the exact same loop starting from a different node
                // Note: Graph cycle deduplication logic can be complex, skipping advanced deduplication for MVP.
                visited.add(item.id);
            }
        }

        console.log(`[BarterEngine] ✅ Found ${matchedLoops.length} potential loops.`);
        return matchedLoops;
    }
}

module.exports = InMemoryGraphAdapter;
