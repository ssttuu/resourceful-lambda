'use strict';


module.exports = {
    '/': {
        users: {
            _methods: {
                GET: 'resources/users',
                PUT: 'resources/users'
            },
            '{user_id}': {
                _methods: {
                    GET: 'resources/users',
                    PUT: 'resources/users'
                }
            }
        },
        chat: {
            _methods: {
                GET: 'resources/chat'
            }
        }
    }
};