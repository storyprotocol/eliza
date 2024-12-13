module.exports = {
    apps: [
        {
            name: 'eliza-api',
            script: 'pnpm',
            args: ['start:api'],
            env: {
                NODE_ENV: 'production'
            }
        },
        {
            name: 'eliza-characters',
            script: 'pnpm',
            args: [
                'start',
                '--character=characters/tate.character.json,characters/trump.character.json',
                '--marilyn=characters/marilyn.character.json'
            ],
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
