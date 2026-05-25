export const CLIENTS = {
    'master': {
        id: 'master',
        name: 'Control Maestro HQ',
        password: 'hq2026',
        role: 'master',
        allowedSources: 'all',
        sections: ['leads', 'marketing', 'stats', 'archive']
    },
    'julio': {
        id: 'julio',
        name: 'Julio Varela',
        password: 'JVSolar2026',
        role: 'client',
        allowedSources: ['direct', 'cuestionario-web'],
        restrictedToProduct: 'Solar',
        sections: ['leads', 'marketing', 'stats', 'archive']
    }
};
