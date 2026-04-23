const { detectCycles } = require('../src/jobs/barterMatchmakerJob');

describe('Barter Matchmaker Job', () => {
  describe('detectCycles', () => {
    it('should detect a simple 2-person cycle (direct swap)', () => {
      // User 1 wants Item 2 (owned by User 2).
      // User 2 wants Item 1 (owned by User 1).
      const activeListings = [
        { id: 1, user_id: 1, desired_item_id: 2 },
        { id: 2, user_id: 2, desired_item_id: 1 }
      ];

      const cycles = detectCycles(activeListings);
      
      expect(cycles.length).toBe(1);
      expect(cycles[0]).toContain(1);
      expect(cycles[0]).toContain(2);
      expect(cycles[0].length).toBe(2);
    });

    it('should detect a 3-person cycle (circular swap)', () => {
      // User 1 wants Item 2 (owned by User 2).
      // User 2 wants Item 3 (owned by User 3).
      // User 3 wants Item 1 (owned by User 1).
      const activeListings = [
        { id: 1, user_id: 1, desired_item_id: 2 },
        { id: 2, user_id: 2, desired_item_id: 3 },
        { id: 3, user_id: 3, desired_item_id: 1 }
      ];

      const cycles = detectCycles(activeListings);
      
      expect(cycles.length).toBe(1);
      expect(cycles[0].length).toBe(3);
      expect(cycles[0]).toEqual(expect.arrayContaining([1, 2, 3]));
    });

    it('should not detect false cycles (chain with no loop)', () => {
      // User 1 wants Item 2
      // User 2 wants Item 3
      // User 3 wants null (or something not in list)
      const activeListings = [
        { id: 1, user_id: 1, desired_item_id: 2 },
        { id: 2, user_id: 2, desired_item_id: 3 },
        { id: 3, user_id: 3, desired_item_id: null }
      ];

      const cycles = detectCycles(activeListings);
      expect(cycles.length).toBe(0);
    });

    it('should prioritize the shortest cycles', () => {
      // 2-person cycle between 1 and 2
      // 3-person cycle between 1, 2, 3
      const activeListings = [
        { id: 1, user_id: 1, desired_item_id: 2 }, // 1 wants 2
        { id: 2, user_id: 2, desired_item_id: 1 }, // 2 wants 1 (2-cycle formed: 1->2->1)
        { id: 3, user_id: 3, desired_item_id: 2 }, // 3 wants 2
        { id: 4, user_id: 2, desired_item_id: 3 }  // wait, this makes user 2 have 2 items? 
        // For simplicity, let's just test that if multiple independent cycles exist, it finds them.
      ];

      // Reset to independent cycles:
      // Cycle A: 1 <-> 2
      // Cycle B: 3 -> 4 -> 5 -> 3
      const listings = [
        { id: 1, user_id: 1, desired_item_id: 2 },
        { id: 2, user_id: 2, desired_item_id: 1 },
        
        { id: 3, user_id: 3, desired_item_id: 4 },
        { id: 4, user_id: 4, desired_item_id: 5 },
        { id: 5, user_id: 5, desired_item_id: 3 }
      ];

      const cycles = detectCycles(listings);
      expect(cycles.length).toBe(2);
      
      // Since it sorts by cycle length ascending:
      expect(cycles[0].length).toBe(2);
      expect(cycles[0]).toEqual(expect.arrayContaining([1, 2]));
      
      expect(cycles[1].length).toBe(3);
      expect(cycles[1]).toEqual(expect.arrayContaining([3, 4, 5]));
    });
  });
});
