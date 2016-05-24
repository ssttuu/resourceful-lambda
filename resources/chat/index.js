'use strict';

exports.handler = (event, context) => {
    let datetime = new Date();
    context.done(null, {
        'chat': true,
        'datetime': datetime.toISOString()
    });
};
