const crypto = require('crypto');

/**
 * Core Barter Engine
 * Uses the injected GraphAdapter to find loops, then validates with Trust constraints.
 */
class BarterEngine {
    constructor(graphAdapter) {
        this.graph = graphAdapter;
        this.MIN_TRUST_THRESHOLD = 3.5;
        this.TRUST_BOND_AMOUNT = 50.00;
    }

    /**
     * Executes the matchmaking logic over a pool of items.
     * @param {Array} items - Raw barter items from db
     * @param {Object} userTrustMap - Map of user properties: { userId: { trustScore: 4.0, ... } }
     */
    async evaluateAndBuildLoops(items, userTrustMap) {
        // 1. Get raw graph circular matches using the injected adapter
        const potentialLoops = this.graph.findCircularMatches(items, 4);

        const validatedLoops = [];

        for (const loopPath of potentialLoops) {
            let totalTrust = 0;
            let loopFailed = false;

            // 2. Validate Trust Scores
            for (const leg of loopPath) {
                const userObj = userTrustMap[leg.user_id];
                const score = userObj ? userObj.trustScore : 0;
                totalTrust += score;
                
                // If the user falls below threshold, we would normally trigger an Escrow Trust Bond lock.
                // For this implementation, we simply flag them as needing a bond.
                if (score < this.MIN_TRUST_THRESHOLD) {
                    console.log(`[BarterEngine] ⚠️ User ${leg.user_id} (${score}) needs a $${this.TRUST_BOND_AMOUNT} Trust Bond.`);
                    leg.requires_bond = true;
                }
            }
            
            // 3. Construct the official trade loop matrix
            if (!loopFailed) {
                const loopId = crypto.randomUUID();
                const matrix = loopPath.map((item, index) => {
                    const nextItem = loopPath[(index + 1) % loopPath.length];
                    return {
                        from_user_id: item.user_id,
                        to_user_id: nextItem.user_id,
                        item_id: item.id
                    };
                });

                validatedLoops.push({
                    loop_id: loopId,
                    loop_trust_avg: totalTrust / loopPath.length,
                    status: 'pending',
                    matrix: matrix
                });
            }
        }

        return validatedLoops;
    }
}

module.exports = BarterEngine;
