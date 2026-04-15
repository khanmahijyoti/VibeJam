export const GHOST_TYPES = [
    {
        id: 'petni',
        name: 'Petni',
        evidence: ['emf', 'thermometer', 'uv'],
        description: 'A female spirit often associated with certain trees. Known to interact frequently with her environment.',
        traits: { interactionRate: 1.5, dotsRate: 1.0 }
    },
    {
        id: 'shakchunni',
        name: 'Shakchunni',
        evidence: ['emf', 'thermometer', 'dots'],
        description: 'A ghost of a married woman. She frequently shows herself to those looking closely.',
        traits: { interactionRate: 1.0, dotsRate: 1.5 }
    },
    {
        id: 'mechho_bhoot',
        name: 'Mechho Bhoot',
        evidence: ['emf', 'uv', 'dots'],
        description: 'A fish-loving ghost usually found near water. Can be quite elusive.',
        traits: { interactionRate: 0.8, dotsRate: 0.8 }
    },
    {
        id: 'jokkho',
        name: 'Jokkho',
        evidence: ['thermometer', 'uv', 'dots'],
        description: 'A protector of hidden wealth. Highly territorial and active in its domain.',
        traits: { interactionRate: 1.2, dotsRate: 1.0 }
    }
];